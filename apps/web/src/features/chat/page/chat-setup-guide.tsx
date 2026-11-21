'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { reopenOnboarding } from '@/features/onboarding';
import { useI18n } from '@/lib/i18n/use-i18n';

/**
 * 无可用对话模型时的空态引导（v4.17：三条起步路径）。
 * 演示模式会直接打开向导的 demo 标签（向导默认第一项），一步即可开启。
 */
export function ChatSetupGuide() {
  const { t } = useI18n();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-sm font-medium">{t('chat.setup.title')}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{t('chat.setup.description')}</p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button type="button" onClick={reopenOnboarding} data-testid="chat-open-wizard">
          {t('chat.setup.openWizard')}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={reopenOnboarding}
          data-testid="chat-try-demo"
        >
          {t('chatMessages.list.firstRunDemo')}
        </Button>
        <Button asChild variant="outline" data-testid="chat-open-templates">
          <Link href="/assistants">{t('chatMessages.list.firstRunTemplates')}</Link>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t('chat.setup.hint')}</p>
    </div>
  );
}
