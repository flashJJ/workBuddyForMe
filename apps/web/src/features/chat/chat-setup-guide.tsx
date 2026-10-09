'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/use-i18n';

/** 无可用对话模型时的空态引导 */
export function ChatSetupGuide() {
  const { t } = useI18n();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-sm font-medium">{t('chat.setup.title')}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{t('chat.setup.description')}</p>
      <Button asChild>
        <Link href="/settings">{t('chat.setup.goToSettings')}</Link>
      </Button>
    </div>
  );
}
