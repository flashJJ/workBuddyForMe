import net from 'node:net';
import type { BrowserWindow } from 'electron';

/** Chromium ERR_ABORTED：主动导航/重载导致的中断，不当作失败重试 */
const ERR_ABORTED = -3;

export interface LoadRetryOptions {
  /** 最多重试次数（成功加载后重置额度） */
  attempts?: number;
  /** 重试间隔 */
  delayMs?: number;
}

export interface WaitOptions {
  timeoutMs?: number;
  intervalMs?: number;
  /** 注入 fetch，便于单测 */
  fetchImpl?: typeof fetch;
  /** 注入 sleep，测试可即时推进 */
  sleep?: (ms: number) => Promise<void>;
}

export const DEFAULT_WAIT_OPTIONS: Required<Pick<WaitOptions, 'timeoutMs' | 'intervalMs'>> = {
  timeoutMs: 30_000,
  intervalMs: 250,
};

/**
 * 轮询托管服务健康检查（/api/health，受 token 守卫保护）。
 * 200 视为就绪；超时抛错。
 */
export async function waitForServer(url: string, token: string, options: WaitOptions = {}): Promise<void> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_WAIT_OPTIONS.timeoutMs;
  const intervalMs = options.intervalMs ?? DEFAULT_WAIT_OPTIONS.intervalMs;
  const doFetch = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    try {
      const res = await doFetch(`${url}/api/health`, {
        headers: { 'x-wbfm-token': token },
      });
      if (res.ok) return;
    } catch {
      // 服务尚未监听，继续轮询
    }
    if (Date.now() >= deadline) throw new Error(`托管服务在 ${timeoutMs}ms 内未就绪: ${url}`);
    await sleep(intervalMs);
  }
}

/**
 * dev 兜底：dev server 重启/未就绪时窗口会停在 ERR_CONNECTION_REFUSED 错误页。
 * 主框架加载失败后延迟重载，最多 attempts 次；成功加载后恢复额度。
 * 生产态由 waitForServer 保证服务就绪，不使用本函数。
 */
export function loadWithDevRetry(win: BrowserWindow, url: string, options: LoadRetryOptions = {}): void {
  const maxAttempts = options.attempts ?? 5;
  const delayMs = options.delayMs ?? 1_000;
  let remaining = maxAttempts;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  win.webContents.on('did-fail-load', (_event, errorCode, _desc, failedUrl, isMainFrame) => {
    if (!isMainFrame || errorCode === ERR_ABORTED || remaining <= 0 || timer !== null) return;
    remaining -= 1;
    const target = failedUrl || url;
    timer = setTimeout(() => {
      timer = null;
      if (!win.isDestroyed()) void win.loadURL(target);
    }, delayMs);
  });
  win.webContents.on('did-finish-load', () => {
    remaining = maxAttempts;
    cancel();
  });
  win.once('closed', cancel);

  void win.loadURL(url);
}

/** 申请一个空闲 TCP 端口（监听后立即释放，降低竞态概率） */
export function getFreePort(host = '127.0.0.1'): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, host, () => {
      const addr = server.address();
      server.close(() => {
        if (addr && typeof addr === 'object') resolve(addr.port);
        else reject(new Error('无法获取空闲端口'));
      });
    });
  });
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
