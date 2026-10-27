import type { TraceHandle } from '@wbfm/ai';
import type { Memory, MemoryKind, MemoryRecallReason } from '@wbfm/shared/types';

/** v2.6：召回结果 = 记忆本体 + 相似度分数与理由（用于溯源 chip 展示） */
export interface RecalledMemory extends Memory {
  score: number;
  reason: MemoryRecallReason;
}

export interface RememberResult {
  created: number;
  updated: number;
  memories: Memory[];
}

export interface RememberOptions {
  sourceConversationId?: string | null;
  /** v2.6：提取来源助手消息 id */
  sourceMessageId?: string | null;
  signal?: AbortSignal;
  traceParent?: TraceHandle | null;
}

export interface RecallOptions {
  signal?: AbortSignal;
  traceParent?: TraceHandle | null;
}

export interface ManualMemoryInput {
  kind: MemoryKind;
  content: string;
  importance: number;
}

/** P1-1 单条情景记忆入库（如会话压缩摘要），复用去重/向量管线 */
export interface RememberOneInput {
  kind: MemoryKind;
  content: string;
  importance: number;
  sourceConversationId?: string | null;
  sourceMessageId?: string | null;
}
