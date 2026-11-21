'use client';

import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/use-i18n';

/** v4.18：会话 token 预算达到 80% 的提示条（可一键调整预算） */
export function BudgetWarningBar({
  warning,
  onAdjust,
  onDismiss,
}: {
  warning: { usedTokens: number; limitTokens: number; ratio: number };
  onAdjust: () => void;
  onDismiss: () => void;
}) {
  const { t } = useI18n();
  return (
    <div
      className="flex items-center justify-between gap-3 border-b bg-amber-500/10 px-4 py-1.5 text-xs text-amber-700 dark:text-amber-300"
      data-testid="budget-warning"
    >
      <span>
        {t('chat.budget.warning', {
          ratio: `${Math.round(warning.ratio * 100)}%`,
          used: warning.usedTokens.toLocaleString(),
          limit: warning.limitTokens.toLocaleString(),
        })}
      </span>
      <div className="flex shrink-0 items-center gap-1">
        <Button type="button" size="sm" variant="ghost" onClick={onAdjust}>
          {t('chat.budget.warningAction')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>
          {t('chat.budget.dismiss')}
        </Button>
      </div>
    </div>
  );
}
