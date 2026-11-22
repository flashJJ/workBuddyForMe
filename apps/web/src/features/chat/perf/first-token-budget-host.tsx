'use client';

import { useToast } from '@/components/common/toast';
import { useI18n } from '@/lib/i18n/use-i18n';
import { FirstTokenBudgetBar } from './first-token-budget-bar';
import type { FirstTokenBudget } from './use-first-token-budget';

interface Props {
  budget: FirstTokenBudget;
  onStop: () => void;
  onReduceContext: () => void;
}

/** v4.20：把提示动作与页面解耦；换模型只聚焦助手切换器并提示，不自动切换 */
export function FirstTokenBudgetHost({ budget, onStop, onReduceContext }: Props) {
  const toast = useToast();
  const { t } = useI18n();
  if (!budget.visible) return null;
  return (
    <FirstTokenBudgetBar
      elapsedMs={budget.elapsedMs}
      onStop={onStop}
      onSwitchModel={() => {
        budget.dismiss();
        document.querySelector<HTMLElement>('[data-testid="assistant-switcher"]')?.focus();
        toast.info(t('chatMessages.perf.switchModelHint'));
      }}
      onReduceContext={() => {
        budget.dismiss();
        onReduceContext();
      }}
      onDismiss={budget.dismiss}
    />
  );
}
