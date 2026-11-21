'use client';

import type { Message } from '@wbfm/shared/types';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useSystemText } from '@/lib/i18n/use-system-text';

/** v4.18：错误态与三个可恢复动作（重试 / 换备用模型 / 保留输入） */
export function MessageError({
  message,
  onRetry,
  onRetryWithFallback,
  onRestoreInput,
}: {
  message: Message;
  onRetry?: () => void;
  onRetryWithFallback?: () => void;
  onRestoreInput?: () => void;
}) {
  const { t } = useI18n();
  const sys = useSystemText();
  return (
    <div
      className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive"
      data-testid="message-error"
    >
      <p>
        {t('chatMessages.generateFailed', {
          reason:
            sys(message.errorMessage) || sys(message.errorCode) || t('chatMessages.unknownError'),
        })}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {onRetry && (
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            {t('common.actions.retry')}
          </Button>
        )}
        {onRetryWithFallback && (
          <Button type="button" size="sm" variant="outline" onClick={onRetryWithFallback}>
            {t('chatMessages.switchFallback')}
          </Button>
        )}
        {onRestoreInput && (
          <Button type="button" size="sm" variant="ghost" onClick={onRestoreInput}>
            {t('chatMessages.keepInput')}
          </Button>
        )}
      </div>
    </div>
  );
}
