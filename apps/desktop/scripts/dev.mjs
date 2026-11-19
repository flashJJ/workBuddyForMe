// 开发态启动器：拉起 Next dev → 轮询端口就绪 → 启动 Electron
// 端口约定：42337（Web dev）/ 42338（CDP），避开 3000 与 Windows 动态端口段。
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(here, '..');
const repoRoot = path.resolve(desktopDir, '..', '..');
const devPort = process.env.WBFM_DEV_PORT ?? '42337';
const debugPort = process.env.WBFM_DEBUG_PORT ?? '42338';
const devUrl = `http://127.0.0.1:${devPort}`;
const READY_TIMEOUT_MS = 90_000;

const children = [];
let nextChild = null;
let stopping = false;

function spawnManaged(command, cwd, env) {
  const child = spawn(command, { cwd, shell: true, stdio: 'inherit', env: env ?? process.env });
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
  startNextServer();
  await waitForDevServer();
  startNextWatchdog();

  // hoisted（nodeLinker=hoisted）模式下 electron 只提升到仓库根 node_modules/.bin，
  // apps/desktop/node_modules/.bin 下不存在，因此必须从 repoRoot 解析绝对路径。
  const binName = process.platform === 'win32' ? 'electron.cmd' : 'electron';
  const bin = path.join(repoRoot, 'node_modules', '.bin', binName);
  const electron = spawn(`"${bin}" . --remote-debugging-port=${debugPort} --no-proxy-server`, {
    cwd: desktopDir,
    shell: true,
    stdio: 'inherit',
    env: { ...process.env, WBFM_DEV: '1', WBFM_DEV_SERVER_URL: devUrl, WBFM_DEBUG_PORT: debugPort },
  });

  electron.on('exit', (code) => shutdown(code ?? 0));
}

function startNextServer() {
  // dev 期 Next 的 webpack 缓存会随访问路由增多持续膨胀（本机实测 RSS 可到 8GB+）。
  // 给它一个 V8 旧生代上限，让 GC 更早介入，避免长时间本地开发把机器内存吃满。
  // 注意：Next dev 自带内存守护，接近上限会自动重启服务；上限过低会让它频繁重启
  // （窗口会短暂 ERR_CONNECTION_REFUSED），默认取 6GB，可用 WBFM_DEV_HEAP_MB 覆盖。
  // 仅作用于 dev server 子进程，打包产物与 Electron 主进程不受影响。
  const heapMb = process.env.WBFM_DEV_HEAP_MB ?? '6144';
  const nextEnv = {
    ...process.env,
    NODE_OPTIONS: process.env.NODE_OPTIONS ?? `--max-old-space-size=${heapMb}`,
  };
  nextChild = spawnManaged(
    `pnpm --filter @wbfm/web exec next dev -H 127.0.0.1 -p ${devPort}`,
    repoRoot,
    nextEnv,
  );
}

/** 只探测端口是否可连接：dev 编译期间 HTTP 可能很慢，但 TCP 仍会 accept */
function canConnect(port, timeoutMs = 1_500) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

/**
 * 内存守护重启偶尔会留下“CLI 还活着、server 进程已退出”的状态。
 * 连续 30s 端口不可连接时整树重启 Next（Electron 侧会自动重连加载）。
 */
function startNextWatchdog() {
  let failures = 0;
  const timer = setInterval(async () => {
    if (stopping) return;
    if (await canConnect(Number(devPort))) {
      failures = 0;
      return;
    }
    failures += 1;
    if (failures < 6) return;
    failures = 0;
    console.warn('[dev] Next dev 连续不可达，重启服务...');
    if (nextChild?.pid) {
      spawnSync('taskkill', ['/PID', String(nextChild.pid), '/T', '/F'], { stdio: 'ignore' });
    }
    startNextServer();
    await waitForDevServer().catch(() => {});
  }, 5_000);
  timer.unref?.();
  return timer;
}

function shutdown(code) {
  stopping = true;
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
