'use client';

import * as React from 'react';
import type {
  WorkPlanStatus,
  WorkPlanView,
  WorkStepStatus,
} from '@wbfm/shared/schemas';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/lib/i18n/use-i18n';

const STATUS_VARIANT: Record<WorkPlanStatus, 'outline' | 'info' | 'success' | 'warning' | 'danger'> = {
  draft: 'outline',
  pending_review: 'warning',
  approved: 'info',
  running: 'info',
  done: 'success',
  rejected: 'danger',
  abandoned: 'outline',
};

const STEP_VARIANT: Record<WorkStepStatus, 'outline' | 'info' | 'success' | 'warning' | 'danger'> = {
  pending: 'outline',
  running: 'info',
  done: 'success',
  skipped: 'outline',
  blocked: 'danger',
};

export interface PlanCardActions {
  onReview: (action: 'submit' | 'approve' | 'reject') => void;
  onSaveSteps: (steps: Array<{ id?: string; title: string }>) => void;
  onStepStatus: (stepId: string, status: WorkStepStatus) => void;
  onDelete: () => void;
}

/** v2.8：单张计划卡（评审 / 改写 / 步骤推进） */
export function PlanCard({ plan, actions }: { plan: WorkPlanView; actions: PlanCardActions }) {
  const { t } = useI18n();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(plan.steps.map((step) => step.title).join('\n'));
  const percent = plan.totalSteps > 0 ? Math.round((plan.completedSteps / plan.totalSteps) * 100) : 0;
  const editable = plan.status === 'draft' || plan.status === 'pending_review' || plan.status === 'rejected';

  const save = () => {
    const titles = draft
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (titles.length === 0) return;
    actions.onSaveSteps(
      titles.map((title, index) => {
        const existing = plan.steps[index];
        return existing && existing.title === title ? { id: existing.id, title } : { title };
      }),
    );
    setEditing(false);
  };

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4" data-testid={`plan-${plan.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={STATUS_VARIANT[plan.status]}>{t(`plans.status.${plan.status}`)}</Badge>
        <span className="text-sm font-medium">{plan.title}</span>
        <span className="text-xs text-muted-foreground">
          {t('plans.progress')} {plan.completedSteps}/{plan.totalSteps}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded bg-muted">
        <div className="h-full bg-primary transition-all" style={{ width: `${percent}%` }} />
      </div>

      {editing ? (
        <div className="space-y-2">
          <Textarea
            value={draft}
            rows={Math.min(10, Math.max(3, plan.steps.length))}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t('plans.stepPlaceholder')}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={save}>
              {t('plans.save')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
              {t('plans.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {plan.steps.map((step) => (
            <li key={step.id} className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={STEP_VARIANT[step.status]}>{t(`plans.stepStatus.${step.status}`)}</Badge>
              <span className={step.status === 'done' ? 'line-through text-muted-foreground' : ''}>
                {step.title}
              </span>
              {(plan.status === 'approved' || plan.status === 'running') && step.status !== 'done' && step.status !== 'skipped' && (
                <span className="flex gap-1">
                  {step.status === 'pending' && (
                    <Button size="sm" variant="ghost" onClick={() => actions.onStepStatus(step.id, 'running')}>
                      {t('plans.markRunning')}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => actions.onStepStatus(step.id, 'done')}>
                    {t('plans.markDone')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => actions.onStepStatus(step.id, 'skipped')}>
                    {t('plans.markSkipped')}
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">{t('plans.reviewHint')}</p>
      <div className="flex flex-wrap gap-2">
        {(plan.status === 'draft' || plan.status === 'rejected') && (
          <Button size="sm" onClick={() => actions.onReview('submit')}>
            {t('plans.submit')}
          </Button>
        )}
        {plan.status === 'pending_review' && (
          <>
            <Button size="sm" onClick={() => actions.onReview('approve')}>
              {t('plans.approve')}
            </Button>
            <Button size="sm" variant="destructive" onClick={() => actions.onReview('reject')}>
              {t('plans.reject')}
            </Button>
          </>
        )}
        {editable && (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            {t('plans.edit')}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={actions.onDelete}>
          {t('plans.delete')}
        </Button>
      </div>
    </div>
  );
}
