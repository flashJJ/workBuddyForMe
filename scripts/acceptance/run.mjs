#!/usr/bin/env node
/**
 * v4.11 P0：离线自动验收入口。
 *
 * 起两个本地进程：
 *   1. Fake Web 夹具（scripts/fixtures/web/server.mjs）
 *   2. Next 服务（WBFM_MOCK_AI=1 + WBFM_MOCK_SCENARIO + WBFM_FETCH_ALLOW_PRIVATE=1）
 * 然后按 tests/scenarios/v4.11-tool-harness.json 的剧本逐案跑真实对话链路。
 *
 * 用法：
 *   node scripts/acceptance/run.mjs [--mode=dev|start] [--port=42341] [--fixture-port=43101] [--out=PATH] [--keep]
 * 退出码：0 全过；1 断言失败；2 基础设施错误。
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { api } from '../eval/lib/http.mjs';
import { ensureMockStack, ensureWindowTiers } from '../eval/lib/mock-seed.mjs';
import { streamChat } from '../eval/lib/sse-client.mjs';
import { printSummary, summarize, writeReport } from '../eval/lib/report.mjs';
import { CASES, createReplayCheck, fetchStats, resetFixture } from './cases.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const TEMPLATE = join(ROOT, 'tests', 'scenarios', 'v4.11-tool-harness.json');

/**
 * v4.11 P1-4：三档生效窗口。同一剧本在不同窗口下应呈现不同的预算/折叠行为，
 * 128K 档复用 `ensureMockStack` 创建的 mock-chat 记录。
 */
const WINDOW_TIERS = [
  { key: '8k', modelId: 'mock-chat-8k', contextWindow: 8_192 },
  { key: '128k', modelId: 'mock-chat', contextWindow: 128_000 },
  { key: '1m', modelId: 'mock-chat-1m', contextWindow: 1_000_000 },
];

function readArgs(argv) {
  const args = {
    mode: process.env.GITHUB_ACTIONS === 'true' ? 'start' : 'dev',
    port: Number(process.env.WBFM_ACCEPTANCE_PORT ?? 42341),
    fixturePort: Number(process.env.WBFM_FIXTURE_PORT ?? 43101),
    out: '',
    only: '',
    replay: '',
    keep: false,
  };
  for (const arg of argv.slice(2)) {
    if (arg === '--keep') args.keep = true;
    else if (arg.startsWith('--mode=')) args.mode = arg.slice('--mode='.length);
    else if (arg.startsWith('--port=')) args.port = Number(arg.slice('--port='.length));
    else if (arg.startsWith('--fixture-port=')) args.fixturePort = Number(arg.slice('--fixture-port='.length));
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length);
    else if (arg.startsWith('--only=')) args.only = arg.slice('--only='.length);
    else if (arg.startsWith('--replay=')) args.replay = arg.slice('--replay='.length);
  }
  return args;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 轮询 URL 直到就绪；超时抛出带最近日志的错误 */
async function waitForUrl(url, { timeoutMs = 180_000, label = url } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // 进程尚未监听
    }
    if (Date.now() > deadline) throw new Error(`等待 ${label} 超时（${timeoutMs}ms）`);
    await sleep(500);
  }
}

/** 子进程带环形日志，失败时可直接打印 */
function spawnLogged(command, options, tag) {
  const buffers = [];
  // POSIX 下放入独立进程组：pnpm → next 的孙进程也随组终止，避免 CI 步骤被残留管道挂住
  const child = spawn(command, {
    ...options,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
  const push = (chunk) => {
    buffers.push(String(chunk));
    if (buffers.length > 400) buffers.shift();
  };
  child.stdout.on('data', push);
  child.stderr.on('data', push);
  return {
    child,
    log: () => buffers.join('').slice(-8_000),
    tag,
  };
}

function stopLogged(entry) {
  return new Promise((resolve) => {
    if (!entry || entry.child.exitCode !== null) return resolve();
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(entry.child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      try {
        process.kill(-entry.child.pid, 'SIGTERM');
      } catch {
        entry.child.kill('SIGTERM');
      }
      // 给整组 2 秒收尾，随后强制清理，防止孙进程继续持有 stdout 管道
      const killTimer = setTimeout(() => {
        try {
          process.kill(-entry.child.pid, 'SIGKILL');
        } catch {
          // 进程组已退出
        }
      }, 2_000);
      killTimer.unref();
    }
    const timer = setTimeout(resolve, 5_000);
    entry.child.once('close', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function buildScenario(workDir, fixtureUrl, replayPath) {
  const template = JSON.parse(readFileSync(TEMPLATE, 'utf-8'));
  if (replayPath) {
    const replay = JSON.parse(readFileSync(replayPath, 'utf-8'));
    // 回放场景覆盖同名内置场景，其余保持模板原样
    Object.assign(template.scenarios, replay.scenarios ?? {});
  }
  const resolved = JSON.stringify(template, null, 2).replaceAll('{{FIXTURE}}', fixtureUrl);
  const path = join(workDir, 'scenario.json');
  writeFileSync(path, resolved, 'utf-8');
  return path;
}

/** 相对路径按工作区根目录解析，绝对路径原样使用 */
function resolvePath(path) {
  return isAbsolute(path) ? path : join(ROOT, path);
}

/** P2-1：把 trace 生成的回放文件转成与 CASES 同形的用例 */
function loadReplayCases(replayPath) {
  const file = JSON.parse(readFileSync(replayPath, 'utf-8'));
  return Object.entries(file.scenarios ?? {}).map(([name, scenario]) => {
    const replay = scenario.replay ?? {};
    return {
      id: name,
      tier: replay.tier ?? '128k',
      message: `[scenario:${name}] ${replay.message ?? 'trace 回放'}`,
      enabledTools: replay.enabledTools ?? [],
      check: createReplayCheck(replay.expect ?? {}),
    };
  });
}

async function runCase({ baseUrl, fixtureUrl, assistantId, testCase }) {
  const conversation = await api(baseUrl, '/api/conversations', {
    method: 'POST',
    body: JSON.stringify({ assistantId, title: `acceptance-${testCase.id}` }),
  });
  for (const warmup of testCase.warmups ?? []) {
    const result = await streamChat(baseUrl, '/api/chat/stream', {
      assistantId,
      conversationId: conversation.id,
      content: warmup,
    });
    if (result.error) throw new Error(`预热对话失败：${result.error}`);
  }
  await resetFixture(fixtureUrl);
  const result = await streamChat(baseUrl, '/api/chat/stream', {
    assistantId,
    conversationId: conversation.id,
    content: testCase.message,
  });
  const stats = await fetchStats(fixtureUrl);
  const verdict = await testCase.check({ result, stats });
  return { id: testCase.id, pass: verdict.pass, reason: verdict.reason, failedReasons: verdict.failedReasons };
}

async function main() {
  const args = readArgs(process.argv);
  const baseUrl = `http://127.0.0.1:${args.port}`;
  const fixtureUrl = `http://127.0.0.1:${args.fixturePort}`;
  const workDir = mkdtempSync(join(tmpdir(), 'wbfm-acceptance-'));
  const replayPath = args.replay ? resolvePath(args.replay) : '';
  const scenarioPath = buildScenario(workDir, fixtureUrl, replayPath);
  let fixture = null;
  let server = null;

  try {
    fixture = spawnLogged(`node scripts/fixtures/web/server.mjs --port=${args.fixturePort}`, { cwd: ROOT }, 'fixture');
    await waitForUrl(`${fixtureUrl}/__stats`, { timeoutMs: 20_000, label: 'Fake Web' });
    console.log(`Fake Web 就绪：${fixtureUrl}`);

    const nextArgs = args.mode === 'start' ? 'start' : 'dev';
    server = spawnLogged(
      `pnpm --filter @wbfm/web exec next ${nextArgs} -H 127.0.0.1 -p ${args.port}`,
      {
        cwd: ROOT,
        env: {
          ...process.env,
          WBFM_MOCK_AI: '1',
          WBFM_MOCK_SCENARIO: scenarioPath,
          WBFM_FETCH_ALLOW_PRIVATE: '1',
          WBFM_DATA_ROOT: workDir,
        },
      },
      'web',
    );
    await waitForUrl(`${baseUrl}/api/health`, { timeoutMs: 240_000, label: 'Next 服务' });
    console.log(`Next 服务就绪：${baseUrl}（mode=${args.mode}）`);

    const stack = await ensureMockStack(baseUrl, { chatContextWindow: 128_000 });
    const tiers = await ensureWindowTiers(baseUrl, stack.providerId, WINDOW_TIERS);
    console.log(
      `窗口档位就绪：${Object.entries(tiers)
        .map(([key, value]) => `${key}=${value.assistantId.slice(0, 8)}`)
        .join(' ')}`,
    );

    const allCases = replayPath ? loadReplayCases(replayPath) : CASES;
    if (replayPath) console.log(`回放模式：${replayPath}`);
    console.log(`\n开始验收：${allCases.length} 个场景\n`);
    const results = [];
    const selected = args.only ? allCases.filter((item) => item.id === args.only) : allCases;
    for (const testCase of selected) {
      const tier = tiers[testCase.tier ?? '128k'];
      let result;
      try {
        if (!tier) throw new Error(`用例 ${testCase.id} 指定的窗口档位不存在：${testCase.tier}`);
        // 回放场景按 trace 还原启用工具；内置用例沿用档位助手的默认工具集
        if (testCase.enabledTools?.length) {
          await api(baseUrl, `/api/assistants/${tier.assistantId}`, {
            method: 'PATCH',
            body: JSON.stringify({ enabledTools: testCase.enabledTools }),
          });
        }
        result = await runCase({
          baseUrl,
          fixtureUrl,
          assistantId: tier.assistantId,
          testCase,
        });
      } catch (error) {
        result = {
          id: testCase.id,
          pass: false,
          failedReasons: [error instanceof Error ? error.message : String(error)],
        };
      }
      results.push(result);
      const tail = result.pass
        ? `  ${result.reason ?? ''}`
        : `  原因：${result.failedReasons?.join('；')}`;
      console.log(`${result.pass ? 'PASS' : 'FAIL'}  ${result.id.padEnd(20)}${tail}`);
    }

    const summary = summarize(results, {
      name: 'acceptance-v4.11',
      meta: { mode: args.mode, fixture: fixtureUrl, scenarios: selected.length },
    });
    const code = printSummary(summary);
    if (args.out) await writeReport(args.out, summary);
    if (code !== 0) {
      console.error(`\n--- Next 日志（尾部）---\n${server.log()}`);
      console.error(`--- Fake Web 日志（尾部）---\n${fixture.log()}`);
    }
    process.exitCode = code;
  } finally {
    await stopLogged(server);
    await stopLogged(fixture);
    if (!args.keep) {
      try {
        rmSync(workDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
      } catch (error) {
        console.warn(`临时目录未清理（可忽略）：${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      console.log(`中间产物保留：${workDir}`);
    }
  }
}

main()
  .then(() => {
    // 子进程已整组终止；显式退出，避免个别残留句柄让 CI 步骤长期停在 in_progress
    process.exit(process.exitCode ?? 0);
  })
  .catch((error) => {
    console.error(`\n验收中断：${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  });
