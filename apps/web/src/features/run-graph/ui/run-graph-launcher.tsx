'use client';

import * as React from 'react';
import { Network } from 'lucide-react';
import type { RunGraphRootKind } from '@wbfm/shared/types';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/use-i18n';
import { RunGraphPanel } from './run-graph-panel';

export interface RunGraphLauncherProps {
  kind: RunGraphRootKind;
  id: string | null;
  className?: string;
}

/** v2.20 M2：右侧抽屉入口；会话顶栏与会议头部共用。 */
export function RunGraphLauncher({ kind, id, className }: RunGraphLauncherProps) {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  if (!id) return null;

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={className}
        onClick={() => setOpen(true)}
        aria-label={t('runGraph.open')}
        data-testid={`run-graph-open-${kind}`}
      >
        <Network className="h-3.5 w-3.5" />
        {t('runGraph.open')}
      </Button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          role="dialog"
          aria-modal="true"
          aria-label={t('runGraph.title')}
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/20"
            aria-label={t('runGraph.close')}
            onClick={() => setOpen(false)}
          />
          <div className="relative z-10 flex h-full w-[min(420px,92vw)] flex-col border-l bg-background shadow-xl">
            <RunGraphPanel
              kind={kind}
              id={id}
              className="h-full rounded-none border-0"
              compact
              onClose={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
