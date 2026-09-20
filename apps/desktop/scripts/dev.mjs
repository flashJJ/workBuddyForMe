// 开发态启动器：拉起 Next dev → 轮询 3000 就绪 → 启动 Electron
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(here, '..');
const repoRoot = path.resolve(desktopDir, '..', '..');
const devUrl = 'http://127.0.0.1:3000';
const READY_TIMEOUT_MS = 90_000;

const children = [];

function spawnManaged(command, cwd) {
  const child = spawn(command, { cwd, shell: true, stdio: 'inherit' });
  children.push(child);
  return child;
}

async function waitForDevServer() {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  for (;;) {
    try {
      const res = await fetch(devUrl, { method: 'GET' });
      if (res.status > 0) return;
    } catch {
      // 尚未就绪
    }
    if (Date.now() > deadline) throw new Error(`等待 Next dev 超时（${devUrl}）`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

async function main() {
  spawnManaged('pnpm --filter @wbfm/web dev', repoRoot);
  await waitForDevServer();

  // hoisted（nodeLinker=hoisted）模式下 electron 只提升到仓库根 node_modules/.bin，
  // apps/desktop/node_modules/.bin 下不存在，因此必须从 repoRoot 解析绝对路径。
  const binName = process.platform === 'win32' ? 'electron.cmd' : 'electron';
  const bin = path.join(repoRoot, 'node_modules', '.bin', binName);
  const electron = spawn(`"${bin}" .`, {
    cwd: desktopDir,
    shell: true,
    stdio: 'inherit',
    env: { ...process.env, WBFM_DEV: '1' },
  });

  electron.on('exit', (code) => shutdown(code ?? 0));
}

function shutdown(code) {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

main().catch((error) => {
  console.error(error);
  shutdown(1);
});
