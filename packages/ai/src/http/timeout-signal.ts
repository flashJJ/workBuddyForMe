export interface LinkedSignal {
  signal: AbortSignal;
  /** 超时触发时调用；外部取消由 signal.reason 区分 */
  dispose: () => void;
  /** 响应头到达后取消超时，但继续转发外部 abort（用于 SSE 长流） */
  clearTimeout: () => void;
  timedOut: () => boolean;
}

/** 组合「外部取消信号 + 超时」为单个 fetch 使用的信号 */
export function withTimeout(external: AbortSignal | undefined, timeoutMs: number): LinkedSignal {
  const controller = new AbortController();
  let didTimeout = false;

  const timer = setTimeout(() => {
    didTimeout = true;
    controller.abort(new DOMException(`请求超时 ${timeoutMs}ms`, 'TimeoutError'));
  }, timeoutMs);

  const onExternalAbort = () => {
    controller.abort(new DOMException('请求已取消', 'AbortError'));
  };
  external?.addEventListener('abort', onExternalAbort, { once: true });
  if (external?.aborted) onExternalAbort();

  return {
    signal: controller.signal,
    timedOut: () => didTimeout,
    clearTimeout: () => clearTimeout(timer),
    dispose: () => {
      clearTimeout(timer);
      external?.removeEventListener('abort', onExternalAbort);
    },
  };
}
