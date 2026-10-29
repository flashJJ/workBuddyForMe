'use client';

import * as React from 'react';
import { Play } from 'lucide-react';
import { BUILT_IN_EVENTS } from '@wbfm/shared/events';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useToast } from '@/components/common/toast';
import { eventTitle } from './event-title';
import type { PreviewResult } from './use-event-director';

interface EventPreviewMenuProps {
  /** 对话/演出占用时禁用触发器（仍可看菜单标题，点击给忙提示） */
  busy?: boolean;
  /** 对话/演出占用时禁用；返回非 ok 时 toast 提示 */
  onPreview: (eventId: string) => PreviewResult | 'missing';
}

/**
 * v1.7 形象栏试运行菜单：手动观看任意内置剧本（绕过冷却/勿扰/停用）。
 * 轻量自绘弹层（仓库无 dropdown 基建）：点击外部/选中后关闭。
 */
export function EventPreviewMenu({ busy = false, onPreview }: EventPreviewMenuProps) {
  const { t } = useI18n();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const close = React.useCallback(() => setOpen(false), []);

  const handlePreview = (eventId: string) => {
    const result = onPreview(eventId);
    if (result !== 'ok') toast.info(t('event.ui.busy'));
    close();
  };

  return (
    <div className="relative">
      <button
        type="button"
        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label={t('event.ui.preview')}
        title={t('event.ui.preview')}
        data-testid="event-preview-trigger"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
      >
        <Play className="h-3.5 w-3.5" />
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            className="fixed inset-0 z-40 cursor-default bg-transparent"
            onClick={close}
          />
          <div
            className="absolute right-0 z-50 mt-1 max-h-72 w-48 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
            data-testid="event-preview-menu"
          >
            {BUILT_IN_EVENTS.map((def) => (
              <button
                key={def.id}
                type="button"
                className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs hover:bg-accent"
                onClick={() => handlePreview(def.id)}
              >
                <Play className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="truncate">{eventTitle(def, t)}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
