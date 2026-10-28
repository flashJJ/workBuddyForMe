import { createConversationRepository, createWorkPlanRepository } from '@wbfm/database';
import { ApiError } from '@wbfm/shared/errors';
import type {
  ConversationGoalView,
  GoalCreateInput,
  GoalUpdateInput,
  WorkPlanCreateInput,
  WorkPlanReviewInput,
  WorkPlanStatus,
  WorkPlanStepUpdateInput,
  WorkPlanUpdateInput,
  WorkPlanView,
} from '@wbfm/shared/schemas';
import type { ServiceDeps } from '../services/deps';

/**
 * v2.8 会话目标 / 计划 / 待办服务。
 *
 * 规则：
 * - Todo 是 kind='todo' 的 Plan（自动 approved），不建平行状态机；
 * - 计划评审 draft → pending_review → approved/rejected；rejected 可改写后重新提交；
 * - 步骤状态只前进：pending → running → done/skipped/blocked；
 * - 服务只落库与校验，不下发工具、不自动执行。
 */

export interface TodoInput {
  title: string;
  status?: 'pending' | 'running' | 'done' | 'skipped' | 'blocked';
}

const EDITABLE: WorkPlanStatus[] = ['draft', 'pending_review', 'rejected'];
const STEP_TERMINAL = new Set(['done', 'skipped', 'blocked']);

const STEP_RANK = { pending: 0, running: 1, done: 2, skipped: 2, blocked: 2 } as const;

function assertStepTransition(
  from: WorkPlanStepUpdateInput['status'],
  to: WorkPlanStepUpdateInput['status'],
): void {
  if (!from || !to || from === to) return;
  if (STEP_TERMINAL.has(from) || STEP_RANK[to] < STEP_RANK[from]) {
    throw ApiError.validation('步骤状态只能前进，不能回退');
  }
}

export interface WorkPlanServiceHooks {
  /** v2.8：计划变化回调（容器接 WorkSignalHub；测试可省略） */
  onChange?: (plan: WorkPlanView) => void;
}

export function createWorkPlanService(deps: ServiceDeps, hooks: WorkPlanServiceHooks = {}) {
  const repo = createWorkPlanRepository(deps.db);
  const conversations = createConversationRepository(deps.db);
  const emit = (plan: WorkPlanView): WorkPlanView => {
    hooks.onChange?.(plan);
    return plan;
  };

  const requireConversation = (conversationId: string): void => {
    if (!conversations.findById(conversationId)) {
      throw ApiError.notFound('会话', conversationId);
    }
  };

  const requirePlan = (id: string): WorkPlanView => {
    const plan = repo.getPlan(id);
    if (!plan) throw ApiError.notFound('计划', id);
    return plan;
  };

  return {
    /* ---------------- goals ---------------- */

    listGoals(conversationId: string): ConversationGoalView[] {
      requireConversation(conversationId);
      return repo.listGoals(conversationId);
    },

    createGoal(input: GoalCreateInput): ConversationGoalView {
      requireConversation(input.conversationId);
      return repo.createGoal(input);
    },

    updateGoal(id: string, patch: GoalUpdateInput): ConversationGoalView {
      if (!repo.getGoal(id)) throw ApiError.notFound('目标', id);
      return repo.updateGoal(id, patch)!;
    },

    deleteGoal(id: string): void {
      if (!repo.deleteGoal(id)) throw ApiError.notFound('目标', id);
    },

    /* ---------------- plans ---------------- */

    listPlans(conversationId?: string): WorkPlanView[] {
      if (conversationId) requireConversation(conversationId);
      return repo.listPlans(conversationId);
    },

    getPlan(id: string): WorkPlanView {
      return requirePlan(id);
    },

    createPlan(input: WorkPlanCreateInput): WorkPlanView {
      requireConversation(input.conversationId);
      if (input.goalId && !repo.getGoal(input.goalId)) {
        throw ApiError.notFound('目标', input.goalId);
      }
      const kind = input.kind ?? 'plan';
      const origin = input.origin ?? 'user';
      // Todo 即轻量已批准清单；模型提出的正式计划进入待评审
      const status: WorkPlanStatus =
        kind === 'todo' ? 'approved' : origin === 'model' ? 'pending_review' : 'draft';
      return emit(
        repo.createPlan({
          conversationId: input.conversationId,
          goalId: input.goalId ?? null,
          kind,
          title: input.title,
          status,
          origin,
          steps: input.steps,
        }),
      );
    },

    updatePlan(id: string, patch: WorkPlanUpdateInput): WorkPlanView {
      const plan = requirePlan(id);
      if (!EDITABLE.includes(plan.status)) {
        throw ApiError.validation('只有草稿/待评审/已驳回的计划可以改写');
      }
      if (patch.steps) {
        const input = patch.steps;
        // 校验步骤 id 属于该计划
        for (const step of input) {
          if (step.id && !plan.steps.some((existing) => existing.id === step.id)) {
            throw ApiError.validation('步骤不属于当前计划');
          }
        }
        const updated = repo.replaceSteps(id, input);
        if (patch.title) return emit(repo.updatePlan(id, { title: patch.title })!);
        return emit(updated!);
      }
      return emit(repo.updatePlan(id, { title: patch.title })!);
    },

    reviewPlan(id: string, input: WorkPlanReviewInput): WorkPlanView {
      const plan = requirePlan(id);
      if (input.action === 'submit') {
        if (plan.status !== 'draft' && plan.status !== 'rejected') {
          throw ApiError.validation('只有草稿/已驳回计划可以提交评审');
        }
        return emit(repo.updatePlan(id, { status: 'pending_review' })!);
      }
      if (input.action === 'approve') {
        if (plan.status !== 'pending_review') {
          throw ApiError.validation('只有待评审计划可以批准');
        }
        return emit(
          repo.updatePlan(id, {
            status: 'approved',
            approvedAt: new Date().toISOString(),
          })!,
        );
      }
      if (plan.status === 'done' || plan.status === 'abandoned') {
        throw ApiError.validation('计划已结束，无法驳回');
      }
      return emit(repo.updatePlan(id, { status: 'rejected' })!);
    },

    updateStep(planId: string, stepId: string, patch: WorkPlanStepUpdateInput): WorkPlanView {
      const plan = requirePlan(planId);
      if (plan.status === 'done' || plan.status === 'abandoned') {
        throw ApiError.validation('计划已结束，不能更新步骤');
      }
      const step = plan.steps.find((item) => item.id === stepId);
      if (!step) throw ApiError.notFound('计划步骤', stepId);
      assertStepTransition(step.status, patch.status);
      repo.updateStep(planId, stepId, patch);
      const updated = requirePlan(planId);
      if (
        (updated.status === 'approved' || updated.status === 'running') &&
        updated.steps.length > 0 &&
        updated.steps.every((item) => STEP_TERMINAL.has(item.status))
      ) {
        return emit(repo.updatePlan(planId, { status: 'done' })!);
      }
      return emit(updated);
    },

    deletePlan(id: string): void {
      if (!repo.deletePlan(id)) throw ApiError.notFound('计划', id);
    },

    /* ---------------- todo（模型工具） ---------------- */

    /** 原子替换会话当前 Todo 清单；返回替换后的计划 */
    writeTodos(conversationId: string, todos: TodoInput[]): WorkPlanView {
      requireConversation(conversationId);
      if (todos.length === 0) throw ApiError.validation('待办清单不能为空');
      const existing = repo.findActiveTodo(conversationId);
      if (existing) {
        const updated = repo.replaceSteps(
          existing.id,
          todos.map((item) => ({ title: item.title, status: item.status })),
        )!;
        if (existing.status !== 'approved' && existing.status !== 'running') {
          return emit(repo.updatePlan(existing.id, { status: 'approved' })!);
        }
        return emit(updated);
      }
      return emit(
        repo.createPlan({
          conversationId,
          kind: 'todo',
          title: '待办',
          status: 'approved',
          origin: 'model',
          steps: todos,
        }),
      );
    },

    /** 对话装配用：当前目标 + 最近计划 + 活跃 Todo */
    activeContext(conversationId: string): {
      goal: ConversationGoalView | null;
      plan: WorkPlanView | null;
      todo: WorkPlanView | null;
    } {
      const goals = repo.listGoals(conversationId);
      const goal = goals.find((item) => item.status === 'active') ?? null;
      const plans = repo.listPlans(conversationId).filter((item) => item.kind === 'plan');
      const plan =
        plans.find(
          (item) =>
            item.status === 'approved' ||
            item.status === 'running' ||
            item.status === 'pending_review' ||
            item.status === 'draft',
        ) ?? null;
      const todo = repo.findActiveTodo(conversationId);
      return { goal, plan, todo };
    },

    /* ---------------- 完成回投幂等 ---------------- */

    claimCompletion(runId: string, kind: string, status: string): boolean {
      return repo.claimCompletion(runId, kind, status);
    },
  };
}

export type WorkPlanService = ReturnType<typeof createWorkPlanService>;
