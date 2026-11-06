import type { ToolTraceEntry } from '@wbfm/shared/types';
import type { MessageKey } from '@wbfm/shared/i18n';

/** 工具的展示态：running/ok 之外把「被拒」「熔断」从普通失败里拆出来 */
export type TraceState = 'running' | 'ok' | 'failed' | 'denied' | 'breaker';
export type TraceFailureReason =
  | 'denied'
  | 'breaker'
  | 'timeout'
  | 'rate'
  | 'auth'
  | 'tooLarge'
  | 'network'
  | 'unknown';

const BREAKER_RE = /熔断|breaker/i;
const DENIED_RE = /拒绝|未授权|策略|POLICY|denied|approval/i;

export function traceState(entry: ToolTraceEntry): TraceState {
  if (entry.status === 'running') return 'running';
  if (entry.status === 'ok') return 'ok';
  const text = `${entry.error ?? ''} ${entry.resultSummary ?? ''}`;
  if (BREAKER_RE.test(text)) return 'breaker';
  if (DENIED_RE.test(text)) return 'denied';
  return 'failed';
}

export const STATE_LABEL_KEYS: Record<TraceState, MessageKey> = {
  running: 'toolTrace.state.running',
  ok: 'toolTrace.state.ok',
  failed: 'toolTrace.state.failed',
  denied: 'toolTrace.state.denied',
  breaker: 'toolTrace.state.breaker',
};

export const STATE_BADGE_VARIANT: Record<
  TraceState,
  'success' | 'danger' | 'warning' | 'outline'
> = {
  running: 'outline',
  ok: 'success',
  failed: 'danger',
  denied: 'warning',
  breaker: 'warning',
};

/** 失败原因归一：把服务端自由文本收敛成几类可展示、可给建议的原因 */
export function traceFailureReason(entry: ToolTraceEntry): TraceFailureReason {
  const text = `${entry.error ?? ''} ${entry.resultSummary ?? ''}`;
  if (BREAKER_RE.test(text)) return 'breaker';
  if (DENIED_RE.test(text)) return 'denied';
  if (/超时|timeout/i.test(text)) return 'timeout';
  if (/429|限流|rate limit/i.test(text)) return 'rate';
  if (/401|403|鉴权|auth/i.test(text)) return 'auth';
  if (/200K|过大|too large|超过.*上限/i.test(text)) return 'tooLarge';
  if (/抓取失败|连接|network|fetch/i.test(text)) return 'network';
  return 'unknown';
}

export const FAILURE_LABEL_KEYS: Record<TraceFailureReason, MessageKey> = {
  denied: 'toolTrace.failure.denied',
  breaker: 'toolTrace.failure.breaker',
  timeout: 'toolTrace.failure.timeout',
  rate: 'toolTrace.failure.rate',
  auth: 'toolTrace.failure.auth',
  tooLarge: 'toolTrace.failure.tooLarge',
  network: 'toolTrace.failure.network',
  unknown: 'toolTrace.failure.unknown',
};

/** fetch_webpage 的目标 URL（参数可能是 JSON 或裸 URL），供「用浏览器打开」 */
export function traceTargetUrl(entry: ToolTraceEntry): string | null {
  const raw = entry.argsSummary?.trim() ?? '';
  if (/^https?:\/\//i.test(raw)) return raw;
  try {
    const parsed = JSON.parse(raw) as { url?: unknown };
    return typeof parsed.url === 'string' && /^https?:\/\//i.test(parsed.url) ? parsed.url : null;
  } catch {
    return null;
  }
}

/** 流式阶段的单行提示来源（思考/搜索/阅读/检索/整理） */
export type StreamPhase = 'searching' | 'reading' | 'retrieving' | 'tool' | 'organizing';

export function streamingPhase(message: {
  status: string;
  content: string;
  toolTrace: ToolTraceEntry[];
}): StreamPhase | null {
  if (message.status !== 'streaming') return null;
  for (let i = message.toolTrace.length - 1; i >= 0; i -= 1) {
    const entry = message.toolTrace[i];
    if (!entry || entry.status !== 'running') continue;
    if (entry.tool === 'web_search') return 'searching';
    if (entry.tool === 'fetch_webpage') return 'reading';
    if (entry.tool === 'knowledge_search') return 'retrieving';
    return 'tool';
  }
  // 工具已全部结束但还没有正文：模型在整理结果（或用第二轮收尾轮成文）
  if (message.toolTrace.length > 0 && !message.content.trim()) return 'organizing';
  return null;
}
