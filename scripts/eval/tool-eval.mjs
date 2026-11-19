#!/usr/bin/env node
/**
 * v4.11 P1-5：工具链路评测入口（promptfoo）。
 *
 * mock 模式（默认）：起 Fake Web + Next（场景化 mock），预置 128K 模型与抓取助手，
 * 然后跑 tests/eval/promptfoo/tools.yaml；全程离线、可进 CI。
 *
 * real 模式：不自起服务，要求已有 WBFM 服务与真实模型助手：
 *   node scripts/eval/tool-eval.mjs --mode=real --base-url=http://127.0.0.1:3200 --assistant-id=<id>
 * 自然语言 prompt 由真实模型自行决定工具；断言会自动降级为「包含期望工具」。
 *
 * 用法：node scripts/eval/tool-eval.mjs [--mode=mock|real] [--port=42342] [--fixture-port=43104]
 * 退出码：promptfoo 的退出码透传（断言失败非 0）。
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { api } from './lib/http.mjs';
import { ensureMockStack } from './lib/mock-seed.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const TEMPLATE = join(ROOT, 'tests', 'scenarios', 'v4.11-tool-harness.json');
const CONFIG = join(ROOT, 'tests', 'eval', 'promptfoo', 'tools.yaml');

function readArgs(argv) {
  const args = {
    mode: 'mock',
    port: Number(process.env.WBFM_TOOL_EVAL_PORT ?? 42342),
    fixturePort: Number(process.env.WBFM_TOOL_EVAL_FIXTURE_PORT ?? 43104),
    baseUrl: process.env.WBFM_TOOL_EVAL_BASE_URL ?? '',
    assistantId: process.env.WBFM_TOOL_EVAL_ASSISTANT_ID ?? '',
    keep: false,
  };
  for (const arg of argv.slice(2)) {
    if (arg === '--keep') args.keep = true;
    else if (arg.startsWith('--mode=')) args.mode = arg.slice('--mode='.length);
    else if (arg.startsWith('--port=')) args.port = Number(arg.slice('--port='.length));
    else if (arg.startsWith('--fixture-port=')) args.fixturePort = Number(arg.slice('--fixture-port='.length));
    else if (arg.startsWith('--base-url=')) args.baseUrl = arg.slice('--base-url='.length);
    else if (arg.startsWith('--assistant-id=')) args.assistantId = arg.slice('--assistant-id='.length);
  }
  return args;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForUrl(url, { timeoutMs = 240_000, label = url } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // 尚未监听
    }
    if (Date.now() > deadline) throw new Error(`等待 ${label} 超时（${timeoutMs}ms）`);
    await sleep(500);
  }
}

function spawnLogged(command, options) {
  const child = spawn(command, { ...options, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let tail = '';
  const push = (chunk) => {
    tail = `${tail}${String(chunk)}`.slice(-8_000);
  };
  child.stdout.on('data', push);
  child.stderr.on('data', push);
  return { child, log: () => tail };
}

function stop(entry) {
  return new Promise((resolve) => {
    if (!entry || entry.child.exitCode !== null) return resolve();
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(entry.child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      entry.child.kill('SIGTERM');
    }
    const timer = setTimeout(resolve, 5_000);
    entry.child.once('close', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function runPromptfoo(env) {
  const result = spawnSync(
    'pnpm',
    ['exec', 'promptfoo', 'eval', '-c', CONFIG, '--no-cache', '--no-progress-bar'],
    {
      cwd: ROOT,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: { ...process.env, ...env },
    },
  );
  return result.status ?? 1;
}

async function runMock(args) {
  const workDir = mkdtempSync(join(tmpdir(), 'wbfm-tool-eval-'));
  const fixtureUrl = `http://127.0.0.1:${args.fixturePort}`;
  const baseUrl = `http://127.0.0.1:${args.port}`;
  const scenarioPath = join(workDir, 'scenario.json');
  writeFileSync(
    scenarioPath,
    readFileSync(TEMPLATE, 'utf8').replaceAll('{{FIXTURE}}', fixtureUrl),
    'utf8',
  );

  const fixture = spawnLogged(`node scripts/fixtures/web/server.mjs --port=${args.fixturePort}`, {
    cwd: ROOT,
  });
  const nextMode = process.env.GITHUB_ACTIONS === 'true' ? 'start' : 'dev';
  const server = spawnLogged(
    `pnpm --filter @wbfm/web exec next ${nextMode} -H 127.0.0.1 -p ${args.port}`,
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
  );

  try {
    await waitForUrl(`${fixtureUrl}/__stats`, { timeoutMs: 20_000, label: 'Fake Web' });
    await waitForUrl(`${baseUrl}/api/health`, { timeoutMs: 240_000, label: 'Next 服务' });
    const stack = await ensureMockStack(baseUrl, { chatContextWindow: 128_000 });
    await api(baseUrl, `/api/assistants/${stack.assistantId}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabledTools: ['fetch_webpage'], knowledgeBaseIds: [], retrieveAlways: false }),
    });
    console.log(`工具评测环境就绪：${baseUrl}（${nextMode}）\n`);
    return runPromptfoo({
      WBFM_TOOL_EVAL_MODE: 'mock',
      WBFM_TOOL_EVAL_BASE_URL: baseUrl,
      WBFM_TOOL_EVAL_ASSISTANT_ID: stack.assistantId,
    });
  } catch (error) {
    console.error(`工具评测环境启动失败：${error instanceof Error ? error.message : String(error)}`);
    console.error(`--- Next 日志 ---\n${server.log()}`);
    return 2;
  } finally {
    await stop(server);
    await stop(fixture);
    if (!args.keep) {
      try {
        rmSync(workDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
      } catch {
        // Windows 句柄延迟释放，临时目录清理失败不影响结论
      }
    } else {
      console.log(`中间产物保留：${workDir}`);
    }
  }
}

function main() {
  const args = readArgs(process.argv);
  if (args.mode === 'real') {
    if (!args.baseUrl || !args.assistantId) {
      console.error('real 模式需要 --base-url 与 --assistant-id（或对应环境变量）');
      process.exitCode = 2;
      return;
    }
    process.exitCode = runPromptfoo({
      WBFM_TOOL_EVAL_MODE: 'real',
      WBFM_TOOL_EVAL_BASE_URL: args.baseUrl,
      WBFM_TOOL_EVAL_ASSISTANT_ID: args.assistantId,
    });
    return;
  }
  runMock(args)
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(`工具评测中断：${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 2;
    });
}

main();
