'use client';

import * as React from 'react';
import { GitFork } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/use-i18n';
import { BranchPanel } from './branch-panel';

/** v2.21：顶栏「分支」入口；右侧抽屉列出/派生当前会话的分支 */
export function BranchLauncher({ conversationId }: { conversationId: string | null }) {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  if (!conversationId) return null;

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        aria-label={t('branch.open')}
        data-testid="branch-open"
      >
        <GitFork className="h-3.5 w-3.5" />
        {t('branch.open')}
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={t('branch.title')}>
          <button
            type="button"
            className="absolute inset-0 bg-black/20"
            aria-label={t('branch.close')}
            onClick={() => setOpen(false)}
          />
          <div className="relative z-10 flex h-full w-[min(440px,92vw)] flex-col border-l bg-background shadow-xl">
            <BranchPanel conversationId={conversationId} onClose={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
