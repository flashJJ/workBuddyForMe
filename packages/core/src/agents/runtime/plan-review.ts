import type { SubtaskSpec } from '@wbfm/shared/schemas';

/**
 * v4.7 P1：计划确认门控（只读预览）。
 *
 * 只对「值得先看一眼」的任务弹计划卡，避免每单都多点一次：
 * - 含 desktop（会操作真实界面，代价最高）
 * - 验收标准 ≥3 条（多目标，容易理解偏差）
 * - 执行说明过长（≥400 字，说明约束多）
 * 简单问答/单步检索默认直接执行。
 */
export const PLAN_REVIEW_BRIEF_THRESHOLD = 400;
export const PLAN_REVIEW_ACCEPTANCE_THRESHOLD = 3;

export function needsPlanReview(subtask: SubtaskSpec): boolean {
  if (subtask.toolScopes?.includes('desktop')) return true;
  if (subtask.acceptance.length >= PLAN_REVIEW_ACCEPTANCE_THRESHOLD) return true;
  return subtask.brief.length >= PLAN_REVIEW_BRIEF_THRESHOLD;
}
