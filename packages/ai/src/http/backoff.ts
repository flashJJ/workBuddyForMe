/** 指数退避：base * 2^attempt，叠加 ±25% 抖动，避免雪崩重试 */
export function backoffDelayMs(attempt: number, baseMs = 500): number {
  const exp = baseMs * 2 ** Math.max(0, attempt);
  const jitter = 0.75 + Math.random() * 0.5;
  return Math.round(exp * jitter);
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('等待被取消', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('等待被取消', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
