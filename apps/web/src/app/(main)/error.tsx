'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
      <Button variant="outline" onClick={reset}>
        {t('common.actions.retry')}
      </Button>
    </div>
  );
}
