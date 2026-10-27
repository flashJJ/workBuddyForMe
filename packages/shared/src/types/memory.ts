import type { Timestamped } from './domain';

/** v0.5 长期记忆类别：事实 / 偏好 / 事件；v2.0 新增 relationship（共同经历） */
export const MEMORY_KINDS = ['fact', 'preference', 'event', 'relationship'] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

/** active=参与召回；archived=软遗忘（P1，暂不自动产生，UI 可见） */
export const MEMORY_STATUSES = ['active', 'archived'] as const;
export type MemoryStatus = (typeof MEMORY_STATUSES)[number];

/** v2.6：召回理由（当前仅语义召回；保留判别字段供后续扩展） */
export const MEMORY_RECALL_REASONS = ['semantic'] as const;
export type MemoryRecallReason = (typeof MEMORY_RECALL_REASONS)[number];

/** v0.5 长期记忆条目 */
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
}
