/**
 * v4.20：对话性能打点。
 *
 * 只写浏览器 Performance Timeline，不包含正文；名称是 v4.20 契约的一部分。
 */
export const PERF_MARK = {
  appReady: 'wbfm:app-ready',
  send: 'wbfm:send',
  firstToken: 'wbfm:first-token',
  firstParagraph: 'wbfm:first-paragraph',
  done: 'wbfm:done',
} as const;

/** 安全打点：SSR、测试环境或旧浏览器缺少 performance.mark 时静默跳过 */
export function markPerf(name: string): void {
  if (typeof performance === 'undefined' || typeof performance.mark !== 'function') return;
  try {
    performance.mark(name);
  } catch {
    // 打点失败不影响对话
  }
}
