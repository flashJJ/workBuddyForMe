#!/usr/bin/env node
/**
 * v4.11 P0：给既有 eval 脚本套一层「自动起服务」。
 *
 * 现有 eval 脚本（eval-agent / eval-context 等）都假设外部已有 WBFM_MOCK_AI=1 的服务，
 * 因此无法直接进 CI。本包装器负责：临时数据根 → 起 Next 服务 → 等健康检查 →
 * 以 --base-url 运行目标脚本 → 退出后回收服务。
 *
 * 用法：node scripts/eval/with-server.mjs --script=scripts/eval/eval-agent.mjs [--port=42340] [--mode=dev|start]
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

function readArgs(argv) {
  const args = {
    script: '',
    port: Number(process.env.WBFM_EVAL_PORT ?? 42340),
    mode: process.env.GITHUB_ACTIONS === 'true' ? 'start' : 'dev',
  };
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--script=')) args.script = arg.slice('--script='.length);
    else if (arg.startsWith('--port=')) args.port = Number(arg.slice('--port='.length));
    else if (arg.startsWith('--mode=')) args.mode = arg.slice('--mode='.length);
  }
  return args;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForHealth(baseUrl, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // 尚未监听
    }
    if (Date.now() > deadline) throw new Error(`等待服务健康检查超时（${timeoutMs}ms）`);
    await sleep(500);
  }
}

function stop(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null) return resolve();
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
    const timer = setTimeout(resolve, 5_000);
    child.once('close', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/** 等进程退出后再删临时目录；Windows 上 SQLite 句柄释放有延迟，失败只告警不影响用例结论 */
async function cleanup(server, dataRoot) {
  await stop(server);
  try {
    rmSync(dataRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  } catch (error) {
    console.warn(`临时数据目录未清理（可忽略）：${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main() {
  const args = readArgs(process.argv);
  if (!args.script) throw new Error('缺少 --script=scripts/eval/xxx.mjs');
  const baseUrl = `http://127.0.0.1:${args.port}`;
  const dataRoot = mkdtempSync(join(tmpdir(), 'wbfm-eval-'));
  const command = `pnpm --filter @wbfm/web exec next ${args.mode === 'start' ? 'start' : 'dev'} -H 127.0.0.1 -p ${args.port}`;
  const server = spawn(command, {
    cwd: ROOT,
    shell: true,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, WBFM_MOCK_AI: '1', WBFM_DATA_ROOT: dataRoot },
  });

  const cleanupServer = () => cleanup(server, dataRoot);

  try {
    await waitForHealth(baseUrl, 240_000);
    console.log(`服务就绪：${baseUrl}（mode=${args.mode}）\n`);
    const code = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [args.script, `--base-url=${baseUrl}`], {
        cwd: ROOT,
        shell: false,
        stdio: 'inherit',
      });
      child.on('error', reject);
      child.on('close', resolve);
    });
    process.exitCode = typeof code === 'number' ? code : 1;
  } finally {
    await cleanupServer();
  }
}

main().catch((error) => {
  console.error(`eval 包装器失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
});
