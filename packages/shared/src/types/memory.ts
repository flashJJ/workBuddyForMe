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

/** v2.28：done 帧下发的约束写入提示（仅 id 与正文；撤销走归档） */
export interface MemoryNotice {
  id: string;
  content: string;
}

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

/**
 * v2.26 P1 上下文分层压缩的领域类型：
 * - ConversationFact：从已折叠对话抽取的结构化事实/决策/未决问题；
 * - TaskCheckpoint：任务执行中的工作记忆快照（带 TTL，完成/超时归档）。
 */

/** 事实类别：客观事实 / 已做决策 / 未决问题 */
export const CONVERSATION_FACT_KINDS = ['fact', 'decision', 'open_loop'] as const;
export type ConversationFactKind = (typeof CONVERSATION_FACT_KINDS)[number];

export interface ConversationFact extends Timestamped {
  id: string;
  conversationId: string;
  kind: ConversationFactKind;
  /** 稳定键：模型给出的主体键，或决策/未决问题的内容指纹 */
  key: string;
  value: string;
  /** 可选单位（元、天、kg 等），无单位时为 null */
  unit: string | null;
  /** 事实生效时间（原文出现的时间点，缺失为 null） */
  validFrom: string | null;
  /** 来源消息 id 列表 */
  sourceMessageIds: string[];
  /** 内容校验和：相同则跳过写入 */
  checksum: string;
}

/** 工作记忆状态：活跃 / 任务完成 / 超时过期 / 手动归档 */
export const TASK_CHECKPOINT_STATUSES = ['active', 'done', 'expired', 'archived'] as const;
export type TaskCheckpointStatus = (typeof TASK_CHECKPOINT_STATUSES)[number];

/** 检查点待办状态与 WorkStepStatus 同源（不反向依赖 schemas） */
export type TaskCheckpointTodoStatus = 'pending' | 'running' | 'done' | 'skipped' | 'blocked';

export interface TaskCheckpointTodo {
  title: string;
  status: TaskCheckpointTodoStatus;
}

export interface TaskCheckpoint extends Timestamped {
  id: string;
  conversationId: string;
  /** 关联的 task_run（普通对话为 null） */
  taskRunId: string | null;
  status: TaskCheckpointStatus;
  goal: string | null;
  plan: string | null;
  todos: TaskCheckpointTodo[];
  /** 最近一次工具结果的短摘要 */
  lastToolSummary: string | null;
  nextStep: string | null;
  /** 到期时间（ISO），null=不过期 */
  expiresAt: string | null;
}

/** v2.28：记忆审计条目（统计卡「最近审计」轻量展示） */
export interface MemoryAuditEntry {
  id: number;
  action: string;
  actor: string;
  createdAt: string;
}

/** v2.26 P2 线上计数：零召回率 / superseded 比例 / 用户纠正次数（管理页与诊断使用） */
export interface MemoryLifecycleStats {
  total: number;
  active: number;
  archived: number;
  /** 被新版本取代的条数 */
  superseded: number;
  /** superseded / total（0~1，空库为 0） */
  supersededRatio: number;
  /** 累计召回次数（按回合计） */
  recallTotal: number;
  /** 零召回次数 / recallTotal（0~1，无召回记录为 0） */
  zeroRecallRate: number;
  /** 用户主动纠正（编辑/归档/恢复/删除）的审计条数 */
  userCorrections: number;
  /** v2.28：最近 5 条审计（可选，旧客户端忽略） */
  recentEvents?: MemoryAuditEntry[];
  /** v2.28：最近一次审计轮转时间（ISO；尚未轮转为 null） */
  lastRollupAt?: string | null;
}
