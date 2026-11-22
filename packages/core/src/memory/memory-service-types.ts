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
  /** v2.31：邻居召回时记录种子记忆 id（用于提示词「关联自」说明） */
  neighborOf?: string;
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
  /** v2.26：批量写入的 TTL（临时事件用，null=永久） */
  ttlAt?: string | null;
  /** v2.28：跳过嵌入调用（实时约束等纯规则写入，零模型成本） */
  skipEmbedding?: boolean;
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

/** v4.21：召回场景——决定默认预算 */
export type MemoryRecallScene = 'chat' | 'task' | 'intent-forget';

export interface MemoryRecallBudget {
  maxItems: number;
  /** 字符近似：1 token ≈ 2 字符，向上取整 */
  maxTokens: number;
}

/** v4.21：统一召回入口请求 */
export interface MemoryRecallRequest extends RecallOptions {
  query: string;
  scene?: MemoryRecallScene;
  /** 覆盖场景预设（只允许调小/调大单个维度） */
  budget?: Partial<MemoryRecallBudget>;
}

/** v4.21：召回解释轨迹（只含元数据，不含正文与 query 原文） */
export interface MemoryRecallTrace {
  scene: MemoryRecallScene;
  at: string;
  queryLength: number;
  durationMs: number;
  candidates: number;
  selected: number;
  dropped: {
    byScore: number;
    byBudget: number;
    byConflict: number;
  };
  channels: {
    semantic: number;
    lexical: number;
    pinned: number;
    neighbor: number;
  };
  resolutions: Array<{
    memoryId: string;
    reason: 'pinned' | 'fresher' | 'higher-confidence' | 'stable-order';
  }>;
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
  /** v2.26：TTL 到期时间（临时事件/工作记忆状态用，null=永久） */
  ttlAt?: string | null;
}
