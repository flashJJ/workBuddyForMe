'use client';

import * as React from 'react';
import { Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/use-i18n';
import { ContextInsightsPanel } from './context-insights-panel';

/** v4.8：对话顶栏「上下文面板」入口（右侧抽屉） */
export function ContextInsightsLauncher({
  conversationId,
  menuItem = false,
}: {
  conversationId: string | null;
  menuItem?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  if (!conversationId) return null;

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant={menuItem ? 'ghost' : 'outline'}
        className={menuItem ? 'w-full justify-start px-2 font-normal' : undefined}
        onClick={() => setOpen(true)}
        aria-label={t('contextInsights.open')}
        data-testid="context-insights-open"
      >
        <Layers className="h-3.5 w-3.5" />
        {t('contextInsights.open')}
      </Button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          role="dialog"
          aria-modal="true"
          aria-label={t('contextInsights.title')}
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/20"
            aria-label={t('contextInsights.close')}
            onClick={() => setOpen(false)}
          />
          <div className="relative z-10 flex h-full w-[min(460px,92vw)] flex-col border-l bg-ui-overlay shadow-xl">
            <ContextInsightsPanel conversationId={conversationId} onClose={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
    </>
  );
}
