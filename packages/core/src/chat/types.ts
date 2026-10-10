import type { Assistant, Citation } from '@wbfm/shared/types';
import type { SseEvent, TokenUsage } from '@wbfm/shared/api';

/**
 * 编排器可 yield 的事件名（运行时镜像见 ORCHESTRATOR_EVENT_NAMES）。
 * 与 SsePayloadMap 中其余线上事件的分工：
 * - task：任务 Agent 循环在 agent/control 追加；
 * - flow：工作流运行 SSE 独立订阅，不经过对话编排器；
 * - voice_audio/voice_state：web 语音桥在传输层追加。
 */
export type OrchestratorEventName =
  | 'meta'
  | 'delta'
  | 'citations'
  | 'memories'
  | 'tool'
  | 'tool_confirmation_required'
  | 'done'
  | 'error';

/** 运行时事件名镜像（穷尽 switch 与 wire 录制一致性测试用；与类型联合同源） */
export const ORCHESTRATOR_EVENT_NAMES = [
  'meta',
  'delta',
  'citations',
  'memories',
  'tool',
  'tool_confirmation_required',
  'done',
  'error',
] as const satisfies readonly OrchestratorEventName[];

/** 编排器产出的事件：从 SSE wire 真源机械派生（v1.1 M4），不再手写 payload 形状 */
export type OrchestratorEvent = SseEvent<OrchestratorEventName>;

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
  /** chunk 条目=分片序号（从 0）；静态条目不使用，固定 0 */
  ordinal: number;
  content: string;
  /** v1.3：引用来源层（普通分片/实体原句/文档要点）；缺省视同普通分片 */
  staticKind?: 'chunk' | 'entity' | 'summary';
  /** v1.3：静态条目与统一引用装配所需（分片条目也带上，便于统一编号） */
  documentId?: string;
  sourceUrl?: string | null;
  pageNo?: number | null;
  paragraphNo?: number | null;
  charStart?: number;
  charEnd?: number;
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
