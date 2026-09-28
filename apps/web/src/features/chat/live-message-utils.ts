import type { Message, ToolTraceEntry } from '@wbfm/shared';
import type { SsePayloadMap } from '@wbfm/shared';

/** 工具 end 事件载荷（phase='end' 分支） */
type ToolEndPayload = Extract<SsePayloadMap['tool'], { phase: 'end' }>;

/** 给最后一条助手消息打补丁（无 live 视图时原样返回） */
export function patchLastAssistantMessage(
  prev: Message[] | null,
  patch: Partial<Message>,
): Message[] | null {
  if (!prev) return prev;
  const next = [...prev];
  for (let i = next.length - 1; i >= 0; i -= 1) {
    if (next[i]!.role === 'assistant') {
      next[i] = { ...next[i]!, ...patch };
      break;
    }
  }
  return next;
}

/** 工具追踪条目 upsert 到最后一条助手消息（start 阶段插入 running 占位） */
export function upsertToolTraceEntry(
  prev: Message[] | null,
  entry: ToolTraceEntry,
): Message[] | null {
  if (!prev) return prev;
  const next = [...prev];
  for (let i = next.length - 1; i >= 0; i -= 1) {
    if (next[i]!.role === 'assistant') {
      const trace = next[i]!.toolTrace ?? [];
      const idx = trace.findIndex((t) => t.callId === entry.callId);
      const nextTrace = idx === -1 ? [...trace, entry] : trace.map((t, j) => (j === idx ? entry : t));
      next[i] = { ...next[i]!, toolTrace: nextTrace };
      break;
    }
  }
  return next;
}

/** tool end 事件落进追踪：合并 start 阶段记录的 argsSummary/startedAt */
export function applyToolTraceEnd(prev: Message[] | null, data: ToolEndPayload): Message[] | null {
  if (!prev) return prev;
  const next = [...prev];
  for (let i = next.length - 1; i >= 0; i -= 1) {
    if (next[i]!.role === 'assistant') {
      const trace = next[i]!.toolTrace ?? [];
      const previous = trace.find((t) => t.callId === data.callId);
      const entry: ToolTraceEntry = {
        callId: data.callId,
        tool: data.tool,
        argsSummary: previous?.argsSummary ?? '',
        status: data.status,
        durationMs: data.durationMs,
        resultSummary: data.resultSummary,
        ...(data.status === 'error' && data.error ? { error: data.error } : {}),
        startedAt: previous?.startedAt ?? new Date().toISOString(),
        ...(data.source ? { source: data.source } : previous?.source ? { source: previous.source } : {}),
        ...(data.permission ? { permission: data.permission } : previous?.permission ? { permission: previous.permission } : {}),
      };
      const idx = trace.findIndex((t) => t.callId === data.callId);
      const nextTrace = idx === -1 ? [...trace, entry] : trace.map((t, j) => (j === idx ? entry : t));
      next[i] = { ...next[i]!, toolTrace: nextTrace };
      break;
    }
  }
  return next;
}
