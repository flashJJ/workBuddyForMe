'use client';

import type { BranchBudget } from '@wbfm/shared/types';
import { useI18n } from '@/lib/i18n/use-i18n';

/** v2.21：会话树 Token 预算：已用 / 预留 / 上限 + 活跃分支数 */
export function BranchBudgetBar({ budget }: { budget: BranchBudget | null }) {
  const { t } = useI18n();
  if (!budget) return null;
  const used = budget.usedTokens + budget.reservedTokens;
  const ratio = budget.limitTokens > 0 ? Math.min(used / budget.limitTokens, 1) : 0;
  const exhausted = used >= budget.limitTokens;

  return (
    <div className="space-y-1" data-testid="branch-budget">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{t('branch.budget.title')}</span>
        <span>
          {t('branch.budget.active', { count: budget.activeCount })}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={exhausted ? 'h-full bg-destructive' : 'h-full bg-primary'}
          style={{ width: `${Math.max(ratio * 100, 2)}%` }}
        />
      </div>
      <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
        <span>
          {t('branch.budget.used')} {budget.usedTokens}
        </span>
        <span>
          {t('branch.budget.reserved')} {budget.reservedTokens}
        </span>
        <span>
          {t('branch.budget.limit')} {budget.limitTokens}
        </span>
      </div>
      {exhausted && <p className="text-xs text-destructive">{t('branch.budget.exhausted')}</p>}
    </div>
  );
}
