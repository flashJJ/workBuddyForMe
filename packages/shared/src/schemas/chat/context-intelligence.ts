import { z } from 'zod';

/**
 * v4.8 对话上下文智能调控契约：
 * - TurnIntent：每轮意图与置信度（只加资源，不减资源）；
 * - ContextPlan：按意图分配上下文块配额；
 * - context_condensed / context_snapshot：压缩与装配的可回溯事件载荷。
 */

export const TURN_INTENT_KINDS = [
  'chitchat',
  'knowledge',
  'follow_up',
  'tool_task',
  'clarify',
  'memory_write',
  'reminder',
] as const;
export type TurnIntentKind = (typeof TURN_INTENT_KINDS)[number];

export const TURN_INTENT_SOURCES = ['rule', 'classifier', 'fallback'] as const;
export type TurnIntentSource = (typeof TURN_INTENT_SOURCES)[number];

export const turnIntentSchema = z.object({
  kind: z.enum(TURN_INTENT_KINDS),
  /** 0–1；低于阈值时 kind 回落 chitchat 且 source=fallback */
  confidence: z.number().min(0).max(1),
  /** 命中信号（规则名/分类器标签），仅用于观测与调试 */
  signals: z.array(z.string().trim().min(1).max(32)).max(8),
  /** 是否建议进入任务模式（只建议，不自动切换） */
  suggestedTaskMode: z.boolean(),
  source: z.enum(TURN_INTENT_SOURCES),
});
export type TurnIntent = z.infer<typeof turnIntentSchema>;

export const CONTEXT_BLOCK_KEYS = ['middle', 'memory', 'evidence', 'tail'] as const;
export type ContextBlockKey = (typeof CONTEXT_BLOCK_KEYS)[number];

export const contextQuotasSchema = z.object({
  /** 最近逐字消息 */
  tail: z.number().min(0).max(1),
  /** 摘要 + 结构化事实 */
  middle: z.number().min(0).max(1),
  /** 长期记忆（含硬约束） */
  memory: z.number().min(0).max(1),
  /** RAG / 工具证据；1 表示不额外设上限（沿用剩余空间） */
  evidence: z.number().min(0).max(1),
});
export type ContextQuotas = z.infer<typeof contextQuotasSchema>;

export const contextPlanSchema = z.object({
  intent: turnIntentSchema,
  quotas: contextQuotasSchema,
  /** 预算不足时的裁剪优先顺序（尾部恒最后） */
  clipOrder: z.array(z.enum(CONTEXT_BLOCK_KEYS)).min(1).max(4),
  /** 装配前是否需要预判压缩（历史占用超水位） */
  preflightCompact: z.boolean(),
});
export type ContextPlan = z.infer<typeof contextPlanSchema>;

export const CONDENSATION_TRIGGERS = [
  'threshold',
  'preflight',
  'model_change',
  'user_explicit',
] as const;
export type CondensationTrigger = (typeof CONDENSATION_TRIGGERS)[number];

export const contextCondensedPayloadSchema = z.object({
  trigger: z.enum(CONDENSATION_TRIGGERS),
  /** 被折叠的消息 id；降级失败时为空数组 */
  foldedMessageIds: z.array(z.string()).max(500),
  summary: z.string().max(8000),
  facts: z.array(z.object({ key: z.string().max(80), value: z.string().max(400) })).max(20),
  decisions: z.array(z.string().max(300)).max(10),
  openLoops: z.array(z.string().max(300)).max(10),
  beforeTokens: z.number().int().nonnegative(),
  afterTokens: z.number().int().nonnegative(),
  /** 数字/日期保真缺失项（已用原文片段兜底） */
  fidelityMissing: z.array(z.string()).max(20),
  /** 摘要不可用等失败场景；true 时原文仍可按 id 读回 */
  degraded: z.boolean(),
});
export type ContextCondensedPayload = z.infer<typeof contextCondensedPayloadSchema>;

export const contextSnapshotPayloadSchema = z.object({
  intent: turnIntentSchema,
  /** 模型上下文窗口（未知时为兜底预算） */
  contextWindow: z.number().int().positive(),
  /** 安全系数收缩后的可用窗口 */
  usableWindow: z.number().int().nonnegative(),
  systemTokens: z.number().int().nonnegative(),
  toolsTokens: z.number().int().nonnegative(),
  reserveTokens: z.number().int().nonnegative(),
  historyBudget: z.number().int().nonnegative(),
  historyTokens: z.number().int().nonnegative(),
  keptMessages: z.number().int().nonnegative(),
  droppedMessages: z.number().int().nonnegative(),
  truncated: z.boolean(),
});
export type ContextSnapshotPayload = z.infer<typeof contextSnapshotPayloadSchema>;
