import type { Timestamped } from './domain';

/**
 * v0.5 长期记忆类别：事实 / 偏好 / 事件；v2.0 新增 relationship（共同经历）；
 * v2.26 新增 constraint（过敏/忌口/明确禁止等硬约束）。
 */
export const MEMORY_KINDS = ['fact', 'preference', 'event', 'relationship', 'constraint'] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

/** active=参与召回；archived=软遗忘；superseded=被新版本取代（保留历史，不参与召回） */
export const MEMORY_STATUSES = ['active', 'archived', 'superseded'] as const;
export type MemoryStatus = (typeof MEMORY_STATUSES)[number];

/** v2.26：召回理由——语义 / 关键词 / 混合 / 置顶硬约束 */
export const MEMORY_RECALL_REASONS = ['semantic', 'keyword', 'hybrid', 'pinned'] as const;
export type MemoryRecallReason = (typeof MEMORY_RECALL_REASONS)[number];

/** v2.26：记忆作用域——全局 / 助手级 / 会话级 */
export const MEMORY_SCOPES = ['global', 'assistant', 'conversation'] as const;
export type MemoryScope = (typeof MEMORY_SCOPES)[number];

/** v2.26：写入来源——手工 / 回合后抽取 / 实时硬约束 / 摘要 / 旧数据 */
export const MEMORY_SOURCES = ['manual', 'extract', 'realtime', 'summary', 'legacy'] as const;
export type MemorySource = (typeof MEMORY_SOURCES)[number];

/** v2.26：长期记忆条目（含版本链与生命周期字段） */
export interface Memory extends Timestamped {
  /** 整型主键（同时作为 sqlite-vec rowid），对外以字符串传递 */
  id: string;
  kind: MemoryKind;
  content: string;
  /** 模型打分 0~1，越高越值得长期保留 */
  importance: number;
  /** 提取来源会话（可空：手工创建无来源） */
  sourceConversationId: string | null;
  /** v2.6：提取来源消息（旧记忆/摘要/手工为 null） */
  sourceMessageId: string | null;
  /** v2.6：被语义召回次数（每次命中 +1） */
  recallCount: number;
  status: MemoryStatus;
  lastAccessedAt: string | null;
  /** v2.26：作用域与归属助手（global 时 assistantId 为 null） */
  scope: MemoryScope;
  assistantId: string | null;
  /** v2.26：写入来源 */
  source: MemorySource;
  /** v2.26：置顶硬约束（召回不受相似度限制，不随时间降权） */
  pinned: boolean;
  /** v2.26：写入置信度 0~1 */
  confidence: number;
  /** v2.26：稳定主体键（如 allergy:peanut / residence:city），用于冲突判定 */
  subjectKey: string | null;
  /** v2.26：版本号，同一主体每次取代 +1 */
  version: number;
  /** v2.26：被哪条新记忆取代（仅 superseded 行有值） */
  supersededBy: string | null;
  /** v2.26：生效时间（双时态） */
  validFrom: string | null;
  /** v2.26：失效时间（被取代/过期时写入） */
  validTo: string | null;
  /** v2.26：TTL 到期时间（临时任务状态用，null=永久） */
  ttlAt: string | null;
  /** v2.26：最近一次被确认/再次提及的时间（recency 基准） */
  lastConfirmedAt: string | null;
}
