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
  /** v2.20 M3：默认实时跟随；timeline 类入口显式关闭 */
  live?: boolean;
  /** v2.23：以菜单项样式渲染触发器（顶栏「更多」弹层内） */
  menuItem?: boolean;
}

/** v2.20 M2：右侧抽屉入口；会话顶栏与会议头部共用。 */
export function RunGraphLauncher({
  kind,
  id,
  className,
  live = true,
  menuItem = false,
}: RunGraphLauncherProps) {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  if (!id) return null;

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant={menuItem ? 'ghost' : 'outline'}
        className={menuItem ? 'w-full justify-start px-2 font-normal' : className}
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
              live={live}
              onClose={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
