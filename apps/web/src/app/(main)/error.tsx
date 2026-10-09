'use client';

import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { helpLink } from '@/features/help-center/help-items';
import { useI18n } from '@/lib/i18n/use-i18n';

/** App Router 模块级错误兜底（reset 由 Next 提供） */
export default function MainError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <AlertTriangle className="h-10 w-10 text-destructive" />
      <div>
        <p className="text-base font-semibold">{t('common.errorBoundary.title')}</p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          {error.message || t('common.errorBoundary.unknownError')}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={reset}>
          {t('common.actions.retry')}
        </Button>
        <Button variant="outline" asChild>
          <Link href={helpLink()}>{t('help.viewHelp')}</Link>
        </Button>
      </div>
    </div>
  );
}
