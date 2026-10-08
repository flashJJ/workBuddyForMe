/** @域 barrel API 信封与 SSE 契约（v1.1 M2 域子路径化） */
export {
  ok,
  fail,
  unwrapEnvelope,
  type ApiEnvelope,
  type ApiSuccess,
  type ApiFailure,
} from './envelope';
export {
  SSE_EVENT,
  formatSse,
  type SseEventName,
  type SsePayloadMap,
  type TokenUsage,
  type RecalledMemoryPayload,
} from './sse';
