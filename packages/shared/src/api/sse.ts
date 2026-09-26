import type { Citation, MemoryKind } from '../types/domain';
import type { ToolEventPayload } from '../types/tool';

/** v0.5：命中的长期记忆轻提示载荷（回答上方「参考了 X 条记忆」） */
export interface RecalledMemoryPayload {
  id: string;
  kind: MemoryKind;
  content: string;
}

/** SSE 事件类型（POST /api/chat/stream） */
export const SSE_EVENT = {
  META: 'meta',
  DELTA: 'delta',
  CITATIONS: 'citations',
  MEMORIES: 'memories',
  TOOL: 'tool',
  DONE: 'done',
  ERROR: 'error',
} as const;

export type SseEventName = (typeof SSE_EVENT)[keyof typeof SSE_EVENT];

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export type SsePayloadMap = {
  meta: { messageId: string; conversationId: string };
  delta: { content: string };
  citations: { citations: Citation[] };
  memories: { memories: RecalledMemoryPayload[] };
  tool: ToolEventPayload;
  done: { content: string; usage: TokenUsage | null };
  error: { code: string; message: string };
};

/** 序列化为 SSE  wire 格式（单行 data JSON） */
export function formatSse<K extends SseEventName>(
  event: K,
  data: SsePayloadMap[K],
): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
