import type { TraceHandle } from '@wbfm/ai';
import type { Memory, MemoryKind } from '@wbfm/shared/types';

export interface RememberResult {
  created: number;
  updated: number;
  memories: Memory[];
}

export interface RememberOptions {
  sourceConversationId?: string | null;
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
}
