import { z } from 'zod';

/**
 * v2.8：会话目标 / 计划 / 待办契约。
 *
 * 口径：
 * - Goal 是会话级目标与成功标准；Plan 是有序可评审步骤；Todo 是 Plan 的轻量视图
 *   （kind='todo'，状态自动 approved），不另建平行状态机；
 * - 未批准（draft/pending_review/rejected）的计划只影响提示词与 UI，不直接执行高风险步骤；
 * - 步骤状态只前进不回退：pending → running → done/skipped/blocked。
 */

export const GOAL_STATUSES = ['active', 'achieved', 'dropped'] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export const WORK_PLAN_KINDS = ['plan', 'todo'] as const;
export type WorkPlanKind = (typeof WORK_PLAN_KINDS)[number];

export const WORK_PLAN_STATUSES = [
  'draft',
  'pending_review',
  'approved',
  'running',
  'done',
  'rejected',
  'abandoned',
] as const;
export type WorkPlanStatus = (typeof WORK_PLAN_STATUSES)[number];

export const WORK_PLAN_ORIGINS = ['user', 'model'] as const;
export type WorkPlanOrigin = (typeof WORK_PLAN_ORIGINS)[number];

export const WORK_STEP_STATUSES = ['pending', 'running', 'done', 'skipped', 'blocked'] as const;
export type WorkStepStatus = (typeof WORK_STEP_STATUSES)[number];

export interface ConversationGoalView {
  id: string;
  conversationId: string;
  title: string;
  successCriteria: string;
  status: GoalStatus;
  createdAt: string;
  updatedAt: string;
}

export interface WorkPlanStepView {
  id: string;
  planId: string;
  stepIndex: number;
  title: string;
  status: WorkStepStatus;
  note: string;
  updatedAt: string;
}

export interface WorkPlanView {
  id: string;
  conversationId: string;
  goalId: string | null;
  kind: WorkPlanKind;
  title: string;
  status: WorkPlanStatus;
  origin: WorkPlanOrigin;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  steps: WorkPlanStepView[];
  /** done + skipped 步数 / 总步数 */
  completedSteps: number;
  totalSteps: number;
}

export const goalCreateSchema = z.object({
  conversationId: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  successCriteria: z.string().trim().max(2000).optional(),
});
export type GoalCreateInput = z.infer<typeof goalCreateSchema>;

export const goalUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    successCriteria: z.string().trim().max(2000).optional(),
    status: z.enum(GOAL_STATUSES).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, '至少提供一个更新字段');
export type GoalUpdateInput = z.infer<typeof goalUpdateSchema>;

const stepInputSchema = z.object({
  title: z.string().trim().min(1).max(300),
  status: z.enum(WORK_STEP_STATUSES).optional(),
  note: z.string().trim().max(500).optional(),
});

export const workPlanCreateSchema = z.object({
  conversationId: z.string().min(1),
  goalId: z.string().min(1).nullable().optional(),
  kind: z.enum(WORK_PLAN_KINDS).optional(),
  title: z.string().trim().min(1).max(200),
  origin: z.enum(WORK_PLAN_ORIGINS).optional(),
  steps: z.array(stepInputSchema).min(1).max(50),
});
export type WorkPlanCreateInput = z.infer<typeof workPlanCreateSchema>;

export const workPlanUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    /** 全量替换步骤（保留 id 的步骤原位更新；未带 id 视为新增） */
    steps: z.array(stepInputSchema.extend({ id: z.string().min(1).optional() })).min(1).max(50).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, '至少提供一个更新字段');
export type WorkPlanUpdateInput = z.infer<typeof workPlanUpdateSchema>;

export const workPlanReviewSchema = z.object({
  action: z.enum(['submit', 'approve', 'reject']),
});
export type WorkPlanReviewInput = z.infer<typeof workPlanReviewSchema>;

export const workPlanStepUpdateSchema = z
  .object({
    status: z.enum(WORK_STEP_STATUSES).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, '至少提供一个更新字段');
export type WorkPlanStepUpdateInput = z.infer<typeof workPlanStepUpdateSchema>;

/** 是否可进入执行提示词（只读计划也允许，但会标注待评审） */
export function isPlanReviewable(status: WorkPlanStatus): boolean {
  return status === 'draft' || status === 'pending_review' || status === 'rejected';
}

/** 是否允许下发高风险（write/danger）工具 */
export function isPlanExecutable(status: WorkPlanStatus): boolean {
  return status === 'approved' || status === 'running' || status === 'done';
}
