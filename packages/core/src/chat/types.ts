import type {
  Assistant,
  Citation,
  SsePayloadMap,
  TokenUsage,
} from '@wbfm/shared';

/** 编排器产出的事件，与 SSE wire 事件一一对应 */
export type OrchestratorEvent =
  | { event: 'meta'; data: SsePayloadMap['meta'] }
  | { event: 'delta'; data: SsePayloadMap['delta'] }
  | { event: 'citations'; data: SsePayloadMap['citations'] }
  | { event: 'tool'; data: SsePayloadMap['tool'] }
  | { event: 'done'; data: SsePayloadMap['done'] }
  | { event: 'error'; data: SsePayloadMap['error'] };

export interface StreamChatInput {
  assistantId: string;
  /** 不传则新建会话 */
  conversationId?: string;
  content: string;
  signal?: AbortSignal;
  /** RAG 检索钩子（Task 17 注入）；返回 null 时退化为普通对话 */
  retrieve?: RagRetriever;
  /** v0.2：重新生成上一条用户消息（conversationId 必填，content 被忽略） */
  regenerate?: boolean;
}

export interface RagContext {
  citations: Citation[];
  contextBlock: string;
}

export type RagRetriever = (
  question: string,
  assistant: Assistant,
  signal?: AbortSignal,
) => Promise<RagContext | null>;

export interface StreamResult {
  usage: TokenUsage | null;
  stopped: boolean;
}
