import { randomBytes } from 'node:crypto';
import { fork, type ChildProcess, type ForkOptions } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { HEALTH_TIMEOUT_MS, HEALTH_INTERVAL_MS, STOP_TIMEOUT_MS, resolveDataRoot, resolveNodeRuntimePath } from './config';
import { renderCipherBootstrap } from './cipher-bootstrap';
import { getFreePort, waitForServer } from './wait-for-server';

/** 测试可注入的 fork 函数签名 */
export type ForkFn = (modulePath: string, args: string[], options: ForkOptions) => ChildProcess;

export interface CipherRef {
  url: string;
  token: string;
}

export interface StartServerOptions {
  userDataDir: string;
  serverPath: string;
  cipher: CipherRef;
  /** 测试注入 */
  forkImpl?: ForkFn;
  waitImpl?: typeof waitForServer;
  portPicker?: () => Promise<number>;
}

export interface ManagedServer {
  url: string;
  token: string;
  port: number;
  stop(): Promise<void>;
}

/**
 * fork Next standalone server.js：
 * - 随机端口 + 随机 bearer token，仅绑定 127.0.0.1
 * - WBFM_SERVER_MANAGED=1 启用 token 守卫
 * - --require 注入 safeStorage 同步桥引导
 */
export async function startManagedServer(options: StartServerOptions): Promise<ManagedServer> {
  const { userDataDir, serverPath, cipher } = options;
  const doFork = (options.forkImpl ?? fork) as ForkFn;
  const doWait = options.waitImpl ?? waitForServer;
  const pickPort = options.portPicker ?? (() => getFreePort());

  const port = await pickPort();
  const token = randomBytes(24).toString('hex');
  const url = `http://127.0.0.1:${port}`;

  const bootstrapPath = path.join(userDataDir, 'cipher-bootstrap.cjs');
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(bootstrapPath, renderCipherBootstrap(cipher), { mode: 0o600 });

  const child = doFork(serverPath, [], {
    // 优先用打包内置的真实 Node（与归集 node_modules 的原生模块同 ABI）；
    // Electron 默认以内置 Node 运行 fork 子进程，会导致 better-sqlite3 dlopen 失败
    execPath: resolveNodeRuntimePath(serverPath) ?? undefined,
    execArgv: ['--require', bootstrapPath],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
      WBFM_SERVER_MANAGED: '1',
      WBFM_TOKEN: token,
      WBFM_DATA_ROOT: resolveDataRoot(userDataDir),
    },
    // Electron 环境下 fork 强制要求 stdio 含 'ipc'（ERR_CHILD_PROCESS_IPC_REQUIRED）
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  child.stdout?.on('data', (chunk: Buffer) => process.stdout.write(`[server] ${chunk}`));
  child.stderr?.on('data', (chunk: Buffer) => process.stderr.write(`[server] ${chunk}`));
  // fork 异常必须可见：否则 waitForServer 只会空转至超时，无从定位
  child.on('error', (error) => {
    console.error(`[server] fork error:`, error);
  });
  child.once('exit', (code, signal) => {
    console.error(`[server] 子进程退出 code=${code} signal=${signal}`);
  });

  await doWait(url, token, { timeoutMs: HEALTH_TIMEOUT_MS, intervalMs: HEALTH_INTERVAL_MS });

  return {
    url,
    token,
    port,
    stop: () => stopChild(child),
  };
}

/** 优雅退出：SIGTERM → 等待 → SIGKILL 兜底，确保端口回收 */
export function stopChild(child: ChildProcess, timeoutMs = STOP_TIMEOUT_MS): Promise<void> {
  if (child.killed || child.exitCode !== null) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, timeoutMs);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill('SIGTERM');
  });
}
