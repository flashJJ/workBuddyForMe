import type { TraceHandle } from '@wbfm/ai';
import type {
  Memory,
  MemoryKind,
  MemoryRecallReason,
  MemoryScope,
  MemorySource,
} from '@wbfm/shared/types';

/** v2.6：召回结果 = 记忆本体 + 相似度分数与理由（用于溯源 chip 展示） */
export interface RecalledMemory extends Memory {
  score: number;
  reason: MemoryRecallReason;
}

export interface RememberResult {
  created: number;
  updated: number;
  /** v2.26：被新版本取代的旧记忆条数 */
  superseded: number;
  memories: Memory[];
}

export interface RememberOptions {
  sourceConversationId?: string | null;
  /** v2.6：提取来源助手消息 id */
  sourceMessageId?: string | null;
  /** v2.26：作用域（回合抽取默认 assistant；手工 global） */
  scope?: MemoryScope;
  assistantId?: string | null;
  /** v2.26：写入来源（缺省按候选类型推断） */
  source?: MemorySource;
  signal?: AbortSignal;
  traceParent?: TraceHandle | null;
}

export interface RecallOptions {
  signal?: AbortSignal;
  traceParent?: TraceHandle | null;
  /** v2.26：作用域过滤——当前助手与会话 */
  assistantId?: string | null;
  conversationId?: string | null;
}

export interface ManualMemoryInput {
  kind: MemoryKind;
  content: string;
  importance: number;
  subjectKey?: string | null;
}

/** P1-1 单条情景记忆入库（如会话压缩摘要），复用去重/向量管线 */
export interface RememberOneInput {
  kind: MemoryKind;
  content: string;
  importance: number;
  sourceConversationId?: string | null;
  sourceMessageId?: string | null;
  scope?: MemoryScope;
  assistantId?: string | null;
  source?: MemorySource;
  subjectKey?: string | null;
  pinned?: boolean;
}
