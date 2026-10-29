import type { WorkPlanView, WorkSignal } from '@wbfm/shared';

/**
 * v2.8：计划 → 工作信号（source=chat）。
 * - draft / pending_review 不进入桌宠（尚未进入执行）；
 * - approved / running 显示 `已完成/总数`；
 * - done → succeeded；rejected / abandoned → cancelled。
 */
export function applyPlanSignal(plan: WorkPlanView, nowIso: string): WorkSignal | null {
  if (plan.status === 'draft' || plan.status === 'pending_review') return null;
  // Todo 是轻量清单：全未开始时不上桌宠，避免空闲时也显示「工作中」
  if (plan.kind === 'todo' && plan.status !== 'done' && plan.completedSteps === 0) return null;
  const outcome: WorkSignal['outcome'] =
    plan.status === 'done'
      ? 'succeeded'
      : plan.status === 'rejected' || plan.status === 'abandoned'
        ? 'cancelled'
        : 'running';
  const terminal = outcome === 'succeeded' || outcome === 'cancelled';
  return {
    key: `chat:${plan.id}`,
    source: 'chat',
    runId: plan.id,
    title: `计划：${plan.title}`.slice(0, 120),
    outcome,
    attention: 'none',
    activity: 'thinking',
    stepLabel: `${plan.completedSteps}/${plan.totalSteps}`,
    completedSteps: plan.completedSteps,
    totalSteps: plan.totalSteps,
    startedAt: plan.createdAt,
    updatedAt: nowIso,
    endedAt: terminal ? nowIso : null,
    errorReason: null,
    deepLink: '/plans',
  };
}
