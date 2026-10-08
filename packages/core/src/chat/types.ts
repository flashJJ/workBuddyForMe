import type { Assistant, Citation } from '@wbfm/shared/types';
import type { SsePayloadMap, TokenUsage } from '@wbfm/shared/api';

/** 编排器产出的事件，与 SSE wire 事件一一对应 */
export type OrchestratorEvent =
  | { event: 'meta'; data: SsePayloadMap['meta'] }
  | { event: 'delta'; data: SsePayloadMap['delta'] }
  | { event: 'citations'; data: SsePayloadMap['citations'] }
  | { event: 'memories'; data: SsePayloadMap['memories'] }
  | { event: 'tool'; data: SsePayloadMap['tool'] }
  | {
      event: 'tool_confirmation_required';
      data: SsePayloadMap['tool_confirmation_required'];
    }
  | { event: 'done'; data: SsePayloadMap['done'] }
  | { event: 'error'; data: SsePayloadMap['error'] };

export interface StreamChatInput {
  assistantId: string;
  /** 不传则新建会话 */
  conversationId?: string;
  /** regenerate 时可省略（服务端沿用上一条用户消息） */
  content?: string;
  /** v0.3：本轮图片附件 ID（先通过 /api/attachments 上传换取），最多 4 张 */
  attachments?: string[];
  signal?: AbortSignal;
  /** RAG 检索钩子（Task 17 注入）；返回 null 时退化为普通对话 */
  retrieve?: RagRetriever;
  /** v0.2：重新生成上一条用户消息（conversationId 必填，content 被忽略） */
  regenerate?: boolean;
}

/** 注入系统提示词前的轻量 RAG 片段（仅保留装配资料块需要的字段） */
export interface RagChunk {
  documentName: string;
  ordinal: number;
  content: string;
}

export interface RagContext {
  citations: Citation[];
  /** 预格式化资料块（无预算约束的兼容路径使用） */
  contextBlock: string;
  /** 结构化片段：prompt 装配时按剩余 token 预算整体/截断注入 */
  chunks: RagChunk[];
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
