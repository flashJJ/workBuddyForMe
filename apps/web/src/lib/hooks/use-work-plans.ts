'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ConversationGoalView,
  GoalUpdateInput,
  WorkPlanStepUpdateInput,
  WorkPlanUpdateInput,
  WorkPlanView,
} from '@wbfm/shared/schemas';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api/client';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';

/** v2.8：目标 / 计划 / 待办查询与变更 */
export function useWorkPlans(conversationId: string | null) {
  const goals = useQuery({
    queryKey: QUERY_KEYS.goals(conversationId ?? ''),
    queryFn: () => apiGet<ConversationGoalView[]>(API.goalsByConversation(conversationId!)),
    enabled: Boolean(conversationId),
  });
  const plans = useQuery({
    queryKey: QUERY_KEYS.workPlans(conversationId ?? undefined),
    queryFn: () =>
      apiGet<WorkPlanView[]>(
        conversationId ? API.workPlansByConversation(conversationId) : API.workPlans,
      ),
    enabled: Boolean(conversationId),
  });
  return {
    goals: goals.data ?? [],
    plans: plans.data ?? [],
    isLoading: goals.isLoading || plans.isLoading,
    isError: goals.isError || plans.isError,
  };
}

export function useWorkPlanMutations(conversationId: string | null) {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['goals'] });
    void qc.invalidateQueries({ queryKey: ['work-plans'] });
  };

  return {
    createGoal: useMutation({
      mutationFn: (input: { title: string; successCriteria?: string }) =>
        apiPost<ConversationGoalView>(API.goals, {
          conversationId,
          ...input,
        }),
      onSuccess: invalidate,
    }),
    updateGoal: useMutation({
      mutationFn: ({ id, patch }: { id: string; patch: GoalUpdateInput }) =>
        apiPatch<ConversationGoalView>(API.goal(id), patch),
      onSuccess: invalidate,
    }),
    deleteGoal: useMutation({
      mutationFn: (id: string) => apiDelete<{ deleted: boolean }>(API.goal(id)),
      onSuccess: invalidate,
    }),
    createPlan: useMutation({
      mutationFn: (input: { title: string; goalId?: string | null; steps: { title: string }[] }) =>
        apiPost<WorkPlanView>(API.workPlans, {
          conversationId,
          kind: 'plan',
          origin: 'user',
          ...input,
        }),
      onSuccess: invalidate,
    }),
    updatePlan: useMutation({
      mutationFn: ({ id, patch }: { id: string; patch: WorkPlanUpdateInput }) =>
        apiPatch<WorkPlanView>(API.workPlan(id), patch),
      onSuccess: invalidate,
    }),
    reviewPlan: useMutation({
      mutationFn: ({ id, action }: { id: string; action: 'submit' | 'approve' | 'reject' }) =>
        apiPost<WorkPlanView>(API.workPlanReview(id), { action }),
      onSuccess: invalidate,
    }),
    updateStep: useMutation({
      mutationFn: ({
        planId,
        stepId,
        patch,
      }: {
        planId: string;
        stepId: string;
        patch: WorkPlanStepUpdateInput;
      }) => apiPatch<WorkPlanView>(API.workPlanStep(planId, stepId), patch),
      onSuccess: invalidate,
    }),
    deletePlan: useMutation({
      mutationFn: (id: string) => apiDelete<{ deleted: boolean }>(API.workPlan(id)),
      onSuccess: invalidate,
    }),
  };
}
