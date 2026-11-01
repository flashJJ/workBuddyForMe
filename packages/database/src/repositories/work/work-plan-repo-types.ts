import type {
  ConversationGoalView,
  GoalStatus,
  WorkPlanKind,
  WorkPlanOrigin,
  WorkPlanStatus,
  WorkPlanStepView,
  WorkPlanView,
  WorkStepStatus,
} from '@wbfm/shared/schemas';

/** v2.8 目标/计划仓储行列与映射（拆分子模块守行数门禁） */

export interface GoalRow {
  id: string;
  conversation_id: string;
  title: string;
  success_criteria: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface PlanRow {
  id: string;
  conversation_id: string;
  goal_id: string | null;
  kind: string;
  title: string;
  status: string;
  origin: string;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
}

export interface PlanStepRow {
  id: string;
  plan_id: string;
  step_index: number;
  title: string;
  status: string;
  note: string;
  updated_at: string;
}

export interface PlanCreateFields {
  conversationId: string;
  goalId?: string | null;
  kind: WorkPlanKind;
  title: string;
  status: WorkPlanStatus;
  origin: WorkPlanOrigin;
  steps: Array<{ title: string; status?: WorkStepStatus; note?: string }>;
}

export interface StepInput {
  id?: string;
  title: string;
  status?: WorkStepStatus;
  note?: string;
}

export function mapGoal(row: GoalRow): ConversationGoalView {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    title: row.title,
    successCriteria: row.success_criteria,
    status: row.status as GoalStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapStep(row: PlanStepRow): WorkPlanStepView {
  return {
    id: row.id,
    planId: row.plan_id,
    stepIndex: row.step_index,
    title: row.title,
    status: row.status as WorkStepStatus,
    note: row.note,
    updatedAt: row.updated_at,
  };
}

export function mapPlan(row: PlanRow, steps: PlanStepRow[]): WorkPlanView {
  const mapped = steps.map(mapStep);
  const done = mapped.filter((step) => step.status === 'done' || step.status === 'skipped').length;
  return {
    id: row.id,
    conversationId: row.conversation_id,
    goalId: row.goal_id,
    kind: row.kind as WorkPlanKind,
    title: row.title,
    status: row.status as WorkPlanStatus,
    origin: row.origin as WorkPlanOrigin,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    approvedAt: row.approved_at,
    steps: mapped,
    completedSteps: done,
    totalSteps: mapped.length,
  };
}
