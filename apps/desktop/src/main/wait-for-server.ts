import net from 'node:net';

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
