import type {
  MemoryKind,
  MemoryScope,
  MemorySource,
  MemoryStatus,
} from '@wbfm/shared/types';

/** v2.26 记忆写入字段（新增生命周期字段均可选，默认兼容旧调用） */
export interface MemoryAddFields {
  kind: MemoryKind;
  content: string;
  importance: number;
  sourceConversationId?: string | null;
  /** v2.6：提取来源助手消息 id（旧数据/手工为 null） */
  sourceMessageId?: string | null;
  status?: MemoryStatus;
  /** v2.26：作用域与归属助手 */
  scope?: MemoryScope;
  assistantId?: string | null;
  source?: MemorySource;
  pinned?: boolean;
  confidence?: number;
  subjectKey?: string | null;
  version?: number;
  validFrom?: string | null;
  ttlAt?: string | null;
  lastConfirmedAt?: string | null;
}

export interface MemoryUpdateFields {
  kind?: MemoryKind;
  content?: string;
  importance?: number;
  status?: MemoryStatus;
  pinned?: boolean;
  confidence?: number;
  subjectKey?: string | null;
  version?: number;
  supersededBy?: string | null;
  validTo?: string | null;
  lastConfirmedAt?: string | null;
}

/** 召回作用域过滤：global 全员可见；assistant 按助手；conversation 按来源会话 */
export interface MemoryScopeFilter {
  assistantId?: string | null;
  conversationId?: string | null;
}

/** 精确作用域（冲突判定用：只在同一作用域内取代，避免跨助手污染） */
export interface MemoryExactScope {
  scope: MemoryScope;
  assistantId?: string | null;
  conversationId?: string | null;
}

export interface MemoryListFilter {
  status?: MemoryStatus;
  kind?: MemoryKind;
  /** 列表/管理页搜索（content LIKE） */
  search?: string;
  /** 创建时间下界（ISO 或 YYYY-MM-DD，含当日） */
  createdAfter?: string;
  /** 创建时间上界（ISO 或 YYYY-MM-DD，含当日） */
  createdBefore?: string;
  /** v2.26：按作用域过滤（主动搭话等轻量读取使用） */
  scope?: MemoryScopeFilter;
  limit?: number;
}

/** P1-1 衰减归档参数（ISO 时间字符串，时间戳比较走 ISO 字典序） */
export interface MemoryDecayFilter {
  /** 仅扫描早于该时间创建的记忆 */
  createdBefore: string;
  /** 从未访问或最后访问早于该时间 */
  accessedBefore: string;
  /** 重要性严格小于该值才归档 */
  maxImportance: number;
}

/** 作用域 SQL 片段：global 或当前助手或当前会话 */
export function applyScope(
  filter: MemoryScopeFilter | undefined,
  where: string[],
  params: Record<string, unknown>,
): void {
  if (!filter) return;
  const clauses = [`scope = 'global'`];
  if (filter.assistantId) {
    clauses.push(`(scope = 'assistant' AND assistant_id = @scopeAssistantId)`);
    params.scopeAssistantId = filter.assistantId;
  }
  if (filter.conversationId) {
    clauses.push(`(scope = 'conversation' AND source_conversation_id = @scopeConversationId)`);
    params.scopeConversationId = filter.conversationId;
  }
  where.push(`(${clauses.join(' OR ')})`);
}

export function toNumberOrNull(value: string | null): number | null {
  return value === null ? null : Number(value);
}

/** YYYY-MM-DD 补全为 UTC 日界；完整 ISO 字符串原样返回 */
export function dayBoundary(value: string, end: boolean): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T${end ? '23:59:59.999Z' : '00:00:00.000Z'}`
    : value;
}
