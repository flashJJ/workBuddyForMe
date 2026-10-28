'use client';

import { ListTodo } from 'lucide-react';
import { useWorkPlans } from '@/lib/hooks/use-work-plans';
import { useI18n } from '@/lib/i18n/use-i18n';

/**
 * v2.8：对话顶部计划提示条——当前目标 + 计划进度 + 待评审状态。
 * 只读摘要；点击进入 /plans 管理页。
 */
export function PlanChip({ conversationId }: { conversationId: string | null }) {
  const { t } = useI18n();
  const { goals, plans } = useWorkPlans(conversationId);
  if (!conversationId) return null;

  const goal = goals.find((item) => item.status === 'active') ?? null;
  const plan =
    plans.find((item) => item.kind === 'plan' && item.status === 'running') ??
    plans.find((item) => item.kind === 'plan' && item.status === 'approved') ??
    plans.find((item) => item.kind === 'plan' && item.status === 'pending_review') ??
    plans.find((item) => item.kind === 'plan' && item.status === 'draft') ??
    null;
  const todo = plans.find((item) => item.kind === 'todo') ?? null;
  if (!goal && !plan && !todo) return null;

  const label = goal?.title ?? plan?.title ?? t('plans.todos');
  const progress = plan ?? todo;
  const pendingReview = plan?.status === 'pending_review';

  return (
    <a
      href="/plans"
      data-testid="chat-plan-chip"
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted"
      title={t('plans.description')}
    >
      <ListTodo className="h-3 w-3" />
      <span className="max-w-[16rem] truncate">{label}</span>
      {progress && (
        <span className="tabular-nums">
          {progress.completedSteps}/{progress.totalSteps}
        </span>
      )}
      {pendingReview && <span className="text-amber-600">{t('plans.status.pending_review')}</span>}
    </a>
  );
}
