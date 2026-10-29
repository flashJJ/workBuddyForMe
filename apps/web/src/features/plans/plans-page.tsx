'use client';

import * as React from 'react';
import type { WorkPlanStatus } from '@wbfm/shared/schemas';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SimpleSelect } from '@/components/ui/simple-select';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState, ErrorState, Spinner } from '@/components/common/state';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useConversations } from '@/lib/hooks/use-conversations';
import { useWorkPlanMutations, useWorkPlans } from '@/lib/hooks/use-work-plans';
import { PlanCard } from './plan-card';

const STATUS_VARIANT: Record<WorkPlanStatus, 'outline' | 'info' | 'success' | 'warning' | 'danger'> = {
  draft: 'outline',
  pending_review: 'warning',
  approved: 'info',
  running: 'info',
  done: 'success',
  rejected: 'danger',
  abandoned: 'outline',
};

/** v2.8：目标 / 计划 / 待办管理页 */
export function PlansPage() {
  const { t } = useI18n();
  const conversations = useConversations();
  const [conversationId, setConversationId] = React.useState(() =>
    typeof window === 'undefined'
      ? ''
      : new URLSearchParams(window.location.search).get('conversation') ?? '',
  );
  const [goalTitle, setGoalTitle] = React.useState('');
  const [goalCriteria, setGoalCriteria] = React.useState('');
  const [planTitle, setPlanTitle] = React.useState('');
  const [planSteps, setPlanSteps] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const list = React.useMemo(() => conversations.data ?? [], [conversations.data]);
  React.useEffect(() => {
    if (!conversationId && list.length > 0) setConversationId(list[0]!.id);
  }, [conversationId, list]);

  const data = useWorkPlans(conversationId || null);
  const mutations = useWorkPlanMutations(conversationId || null);
  const plans = data.plans.filter((plan) => plan.kind === 'plan');
  const todos = data.plans.filter((plan) => plan.kind === 'todo');
  const activeGoal = data.goals.find((goal) => goal.status === 'active') ?? null;

  const run = async (action: () => Promise<unknown>, fallback: string) => {
    setError(null);
    try {
      await action();
    } catch {
      setError(fallback);
    }
  };

  const createGoal = () => {
    if (!goalTitle.trim()) return;
    void run(async () => {
      await mutations.createGoal.mutateAsync({
        title: goalTitle.trim(),
        ...(goalCriteria.trim() ? { successCriteria: goalCriteria.trim() } : {}),
      });
      setGoalTitle('');
      setGoalCriteria('');
    }, t('plans.createFailed'));
  };

  const createPlan = () => {
    const steps = planSteps
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (!planTitle.trim() || steps.length === 0) return;
    void run(async () => {
      await mutations.createPlan.mutateAsync({
        title: planTitle.trim(),
        goalId: activeGoal?.id ?? null,
        steps: steps.map((title) => ({ title })),
      });
      setPlanTitle('');
      setPlanSteps('');
    }, t('plans.createFailed'));
  };

  const pendingReview = plans.filter((plan) => plan.status === 'pending_review').length;

  return (
    <div className="space-y-4 p-4" data-testid="plans-page">
      <PageHeader
        title={t('plans.title')}
        description={t('plans.description')}
        actions={
          <div className="w-64">
            <SimpleSelect
              value={conversationId}
              onValueChange={setConversationId}
              aria-label={t('plans.conversation')}
            >
              <option value="">{t('plans.allConversations')}</option>
              {list.map((conversation) => (
                <option key={conversation.id} value={conversation.id}>
                  {conversation.title}
                </option>
              ))}
            </SimpleSelect>
          </div>
        }
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!conversationId ? (
        <EmptyState title={t('plans.empty')} />
      ) : data.isLoading ? (
        <Spinner />
      ) : data.isError ? (
        <ErrorState message={t('plans.loadFailed')} onRetry={() => undefined} />
      ) : (
        <>
          {/* 目标 */}
          <section className="space-y-3 rounded-lg border bg-card p-4" data-testid="plans-goals">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">{t('plans.goals')}</h2>
              {activeGoal && (
                <Badge variant="info">{t('plans.goalStatus.active')}</Badge>
              )}
            </div>
            {activeGoal ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{activeGoal.title}</span>
                {activeGoal.successCriteria && (
                  <span className="text-xs text-muted-foreground">{activeGoal.successCriteria}</span>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void run(
                      () =>
                        mutations.updateGoal.mutateAsync({
                          id: activeGoal.id,
                          patch: { status: 'achieved' },
                        }),
                      t('plans.actionFailed'),
                    )
                  }
                >
                  {t('plans.closeGoal')}
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{t('plans.goalEmpty')}</p>
            )}
            <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
              <Input
                value={goalTitle}
                placeholder={t('plans.goalTitlePlaceholder')}
                aria-label={t('plans.goalTitle')}
                onChange={(event) => setGoalTitle(event.target.value)}
              />
              <Input
                value={goalCriteria}
                placeholder={t('plans.goalCriteriaPlaceholder')}
                aria-label={t('plans.goalCriteria')}
                onChange={(event) => setGoalCriteria(event.target.value)}
              />
              <Button size="sm" onClick={createGoal} disabled={!goalTitle.trim()}>
                {t('plans.createGoal')}
              </Button>
            </div>
          </section>

          {/* 计划 */}
          <section className="space-y-3" data-testid="plans-list">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-medium">{t('plans.plans')}</h2>
              {pendingReview > 0 && (
                <Badge variant="warning">
                  {t('plans.status.pending_review')} {pendingReview}
                </Badge>
              )}
            </div>
            {plans.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('plans.planEmpty')}</p>
            ) : (
              plans.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  actions={{
                    onReview: (action) =>
                      void run(
                        () => mutations.reviewPlan.mutateAsync({ id: plan.id, action }),
                        t('plans.actionFailed'),
                      ),
                    onSaveSteps: (steps) =>
                      void run(
                        () => mutations.updatePlan.mutateAsync({ id: plan.id, patch: { steps } }),
                        t('plans.saveFailed'),
                      ),
                    onStepStatus: (stepId, status) =>
                      void run(
                        () =>
                          mutations.updateStep.mutateAsync({
                            planId: plan.id,
                            stepId,
                            patch: { status },
                          }),
                        t('plans.actionFailed'),
                      ),
                    onDelete: () =>
                      void run(
                        () => mutations.deletePlan.mutateAsync(plan.id),
                        t('plans.actionFailed'),
                      ),
                  }}
                />
              ))
            )}
            <div className="space-y-2 rounded-lg border border-dashed p-4">
              <Input
                value={planTitle}
                placeholder={t('plans.planTitlePlaceholder')}
                aria-label={t('plans.planTitle')}
                onChange={(event) => setPlanTitle(event.target.value)}
              />
              <Textarea
                value={planSteps}
                rows={3}
                placeholder={t('plans.stepPlaceholder')}
                aria-label={t('plans.steps')}
                onChange={(event) => setPlanSteps(event.target.value)}
              />
              <Button size="sm" onClick={createPlan} disabled={!planTitle.trim() || !planSteps.trim()}>
                {t('plans.newPlan')}
              </Button>
            </div>
          </section>

          {/* 待办 */}
          <section className="space-y-2" data-testid="plans-todos">
            <h2 className="text-sm font-medium">{t('plans.todos')}</h2>
            {todos.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('plans.todoEmpty')}</p>
            ) : (
              todos.map((todo) => (
                <div key={todo.id} className="rounded-lg border bg-card p-3">
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_VARIANT[todo.status]}>
                      {t(`plans.status.${todo.status}`)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {todo.completedSteps}/{todo.totalSteps}
                    </span>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {todo.steps.map((step) => (
                      <li key={step.id} className="flex items-center gap-2 text-sm">
                        <Badge variant={step.status === 'done' ? 'success' : 'outline'}>
                          {t(`plans.stepStatus.${step.status}`)}
                        </Badge>
                        <span>{step.title}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </section>
        </>
      )}
    </div>
  );
}
