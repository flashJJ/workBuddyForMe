'use client';

import { Clock3, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n/use-i18n';
import { CHAT_CONTENT_MAX_WIDTH } from '../chat-layout';

interface Props {
  elapsedMs: number;
  onStop: () => void;
  onSwitchModel: () => void;
  onReduceContext: () => void;
  onDismiss: () => void;
}

/** v4.20：首字超过本机基线时的非阻断提示；不自动切换模型或截断上下文 */
export function FirstTokenBudgetBar({
  elapsedMs,
  onStop,
  onSwitchModel,
  onReduceContext,
  onDismiss,
}: Props) {
  const { t } = useI18n();
  return (
    <div
      className={`mx-auto w-full ${CHAT_CONTENT_MAX_WIDTH} px-4 pb-1`}
      data-testid="first-token-budget-bar"
      role="status"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border bg-muted/40 px-3 py-2 text-xs">
        <Clock3 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1 text-muted-foreground">
          {t('chatMessages.perf.firstTokenSlow', { ms: elapsedMs })}
        </span>
        <button
          type="button"
          className="font-medium text-primary hover:underline"
          onClick={onStop}
        >
          {t('chatMessages.perf.stop')}
        </button>
        <button
          type="button"
          className="font-medium text-primary hover:underline"
          onClick={onSwitchModel}
        >
          {t('chatMessages.perf.switchModel')}
        </button>
        <button
          type="button"
          className="font-medium text-primary hover:underline"
          onClick={onReduceContext}
        >
          {t('chatMessages.perf.reduceContext')}
        </button>
        <button
          type="button"
          aria-label={t('chatMessages.perf.dismiss')}
          className="text-muted-foreground hover:text-foreground"
          onClick={onDismiss}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
