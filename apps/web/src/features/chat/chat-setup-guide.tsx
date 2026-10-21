'use client';

import { Button } from '@/components/ui/button';
import { reopenOnboarding } from '@/features/onboarding/use-onboarding-host';
import { useI18n } from '@/lib/i18n/use-i18n';

/** 无可用对话模型时的空态引导：直接调起配置向导（演示模式 / 本地模型 / 云端 API） */
export function ChatSetupGuide() {
  const { t } = useI18n();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-sm font-medium">{t('chat.setup.title')}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{t('chat.setup.description')}</p>
      <Button type="button" onClick={reopenOnboarding} data-testid="chat-open-wizard">
        {t('chat.setup.openWizard')}
      </Button>
      <p className="text-xs text-muted-foreground">{t('chat.setup.hint')}</p>
    </div>
  );
}
