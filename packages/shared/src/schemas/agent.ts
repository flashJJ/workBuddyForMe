import { z } from 'zod';
import type { Citation } from '../types/domain';

/**
 * v1.4 多智能体协作契约（M0）：
 * 固定三角色 Planner/Executor/Reviewer，角色间只传结构化 Handoff（JSON），
 * 不做自由群聊。本文件是协作内核（M1+）、v019 存储与 SSE 事件共同的类型真源。
 */

// ---------------------------------------------------------------------------
// 角色与状态
// ---------------------------------------------------------------------------

export const AGENT_ROLES = ['planner', 'executor', 'reviewer'] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

export const AGENT_PHASES = ['planning', 'executing', 'reviewing', 'done', 'failed'] as const;
export type AgentPhase = (typeof AGENT_PHASES)[number];

export const REVIEW_VERDICTS = ['approve', 'revise', 'reject'] as const;
export type ReviewVerdict = (typeof REVIEW_VERDICTS)[number];

export const AGENT_RUN_STATUSES = [
  'running',
  'done',
  'failed',
  'cancelled',
  'budget_exceeded',
] as const;
export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];

/** 交接正文长度上限（防爆 token 与提示词注入，M1 协议层据此校验） */
export const AGENT_LIMITS = {
  SUBTASK_TITLE_MAX: 100,
  SUBTASK_BRIEF_MAX: 2000,
  ACCEPTANCE_ITEM_MAX: 500,
  ACCEPTANCE_MIN: 1,
  ACCEPTANCE_MAX: 10,
  OUTCOME_SUMMARY_MAX: 4000,
  REVIEW_NOTES_MAX: 2000,
} as const;

// ---------------------------------------------------------------------------
// 三重预算（M1 budget.ts 的默认值与上下限真源）
// ---------------------------------------------------------------------------

export const AGENT_BUDGET_DEFAULTS = {
  /** 规划-执行-审查完整轮次上限（返工一次即消耗一轮） */
  maxRounds: 3,
  /** 单执行角色步数上限（沿用 task-loop max_steps 语义） */
  maxSteps: 20,
  /** 单次协作运行总 token 上限 */
  maxTotalTokens: 80_000,
} as const;

export const AGENT_BUDGET_BOUNDS = {
  maxRounds: { min: 1, max: 5 },
  maxSteps: { min: 1, max: 50 },
  maxTotalTokens: { min: 10_000, max: 200_000 },
} as const;

export const agentBudgetSchema = z
  .object({
    maxRounds: z
      .number()
      .int()
      .min(AGENT_BUDGET_BOUNDS.maxRounds.min)
      .max(AGENT_BUDGET_BOUNDS.maxRounds.max)
      .default(AGENT_BUDGET_DEFAULTS.maxRounds),
    maxSteps: z
      .number()
      .int()
      .min(AGENT_BUDGET_BOUNDS.maxSteps.min)
      .max(AGENT_BUDGET_BOUNDS.maxSteps.max)
      .default(AGENT_BUDGET_DEFAULTS.maxSteps),
    maxTotalTokens: z
      .number()
      .int()
      .min(AGENT_BUDGET_BOUNDS.maxTotalTokens.min)
      .max(AGENT_BUDGET_BOUNDS.maxTotalTokens.max)
      .default(AGENT_BUDGET_DEFAULTS.maxTotalTokens),
  })
  .default(AGENT_BUDGET_DEFAULTS);
export type AgentBudget = z.infer<typeof agentBudgetSchema>;

/** 预算实时消耗快照（agent:budget 帧载荷） */
export interface AgentBudgetUsage {
  round: number;
  steps: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// ---------------------------------------------------------------------------
// Handoff 载荷（角色交接的唯一数据形状）
// ---------------------------------------------------------------------------

/** planner→executor：单个可执行子任务单（首期串行单执行） */
export const subtaskSpecSchema = z.object({
  title: z.string().trim().min(1).max(AGENT_LIMITS.SUBTASK_TITLE_MAX),
  brief: z.string().trim().min(1).max(AGENT_LIMITS.SUBTASK_BRIEF_MAX),
  acceptance: z
    .array(z.string().trim().min(1).max(AGENT_LIMITS.ACCEPTANCE_ITEM_MAX))
    .min(AGENT_LIMITS.ACCEPTANCE_MIN)
    .max(AGENT_LIMITS.ACCEPTANCE_MAX),
  /** 允许工具域提示（['knowledge']、['mcp:<server>']、桌面类需显式 'desktop'） */
  toolScopes: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  /** 指定知识库；缺省由执行通道继承助手绑定 */
  knowledgeBaseId: z.string().trim().min(1).nullable().optional(),
});
export type SubtaskSpec = z.infer<typeof subtaskSpecSchema>;

/** executor→reviewer：结构化交付物（证据与工具轨迹由系统侧收敛，不靠模型自报） */
export const executorOutcomeSchema = z.object({
  summary: z.string().trim().min(1).max(AGENT_LIMITS.OUTCOME_SUMMARY_MAX),
  evidence: z.array(z.unknown()).max(30).default([]),
  toolCalls: z.array(z.string().max(120)).max(100).default([]),
  unfinished: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
});
export type ExecutorOutcome = Omit<z.infer<typeof executorOutcomeSchema>, 'evidence'> & {
  evidence: Citation[];
};

/** reviewer→planner/user：审查裁决（approve 交付；revise 附意见返工；reject 终止） */
export const reviewVerdictSchema = z.object({
  verdict: z.enum(REVIEW_VERDICTS),
  /** revise/reject 必填理由（approve 可空） */
  reviewNotes: z.string().trim().max(AGENT_LIMITS.REVIEW_NOTES_MAX).optional(),
  /** 验收逐条结论（与 SubtaskSpec.acceptance 下标对齐） */
  acceptanceResults: z
    .array(z.object({ passed: z.boolean(), note: z.string().trim().max(300).default('') }))
    .max(AGENT_LIMITS.ACCEPTANCE_MAX)
    .default([]),
});
export type ReviewVerdictPayload = z.infer<typeof reviewVerdictSchema>;

/**
 * 交接载荷：三类字段按角色拓扑各出现一次（M1 runner 按 from/to 配对
 * 用 assertHandoffForRoles 做强校验）；M0 schema 只约束形状。
 */
export const agentHandoffPayloadSchema = z
  .object({
    subtask: subtaskSpecSchema.optional(),
    outcome: executorOutcomeSchema.optional(),
    verdict: z.enum(REVIEW_VERDICTS).optional(),
    reviewNotes: z.string().trim().max(AGENT_LIMITS.REVIEW_NOTES_MAX).optional(),
    acceptanceResults: reviewVerdictSchema.shape.acceptanceResults.optional(),
  })
  .refine(
    (v) => Boolean(v.subtask) || Boolean(v.outcome) || Boolean(v.verdict),
    'Handoff 必须包含 subtask/outcome/verdict 之一',
  );
export type AgentHandoffPayload = z.infer<typeof agentHandoffPayloadSchema>;

/** 合法角色交接对（M1 校验函数的拓扑真源） */
export const AGENT_HANDOFF_EDGES = [
  'planner:executor',
  'executor:reviewer',
  'reviewer:planner',
  'reviewer:user',
] as const;
export type AgentHandoffEdge = (typeof AGENT_HANDOFF_EDGES)[number];

export function agentHandoffEdge(from: AgentRole, to: AgentRole | 'user'): AgentHandoffEdge {
  return `${from}:${to}` as AgentHandoffEdge;
}

/** 判断角色对是否为合法交接边（M1 协议层与存储层共用） */
export function isValidHandoffEdge(edge: string): edge is AgentHandoffEdge {
  return (AGENT_HANDOFF_EDGES as readonly string[]).includes(edge);
}

// ---------------------------------------------------------------------------
// API 契约
// ---------------------------------------------------------------------------

/** POST /api/agent/runs 请求体 */
export const agentRunCreateSchema = z.object({
  assistantId: z.string().trim().min(1),
  /** 任务模式入口关联会话；Flow agent 节点发起时走内部服务不经此 API */
  conversationId: z.string().trim().min(1).optional(),
  goal: z.string().trim().min(1).max(2000),
  budget: agentBudgetSchema.optional(),
});
export type AgentRunCreateInput = z.infer<typeof agentRunCreateSchema>;

/** 协作运行视图（列表/详情/SSE 终态） */
export interface AgentRunView {
  id: string;
  conversationId: string | null;
  flowRunId: string | null;
  nodeExecutionId: string | null;
  assistantId: string;
  goal: string;
  status: AgentRunStatus;
  roundNo: number;
  budget: AgentBudget;
  finalOutcome: ExecutorOutcome | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 交接记录视图（泳道时间线数据源） */
export interface AgentHandoffView {
  id: string;
  runId: string;
  roundNo: number;
  seq: number;
  fromRole: AgentRole;
  toRole: AgentRole | 'user';
  payload: AgentHandoffPayload;
  createdAt: string;
}
