'use client';

import * as React from 'react';
import type { EventTriggerView } from '@wbfm/shared/schemas';
import { BUILT_IN_EVENTS } from '@wbfm/shared/events';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useAssistants } from '@/lib/hooks/use-assistants';
import { eventTitle as resolveEventTitle } from './event-title';
import { useEventTriggerMutations, useEventTriggers } from './use-event-triggers-data';
import { CustomTriggerFormDialog } from './custom-trigger-form-dialog';

/**
 * v1.7 M5 自定义短语触发器区块（挂在剧情演出设置面板内）。
 * 列表展示规则摘要（短语/剧本/闸门），支持启停、编辑、删除。
 */
export function CustomTriggerSection() {
  const { t } = useI18n();
  const { data: triggers } = useEventTriggers();
  const { data: assistantsRaw } = useAssistants();
  const assistants = Array.isArray(assistantsRaw) ? assistantsRaw : [];
  const mutations = useEventTriggerMutations();

  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => setHydrated(true), []);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<EventTriggerView | null>(null);

  const nameOf = (assistantId: string) =>
    assistants?.find((item) => item.id === assistantId)?.name ?? '—';
  const eventTitle = (eventId: string) => {
    const def = BUILT_IN_EVENTS.find((item) => item.id === eventId);
    return def ? resolveEventTitle(def, t) : eventId;
  };

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  // 乐观启停：受控勾选框直接绑服务端数据时，PATCH→失效→重拉窗口内点击会被
  // React 回弹为原态（Playwright uncheck 报「点击未改变状态」），故本地先翻值
  const [enabledOverride, setEnabledOverride] = React.useState<Record<string, boolean>>({});
  const toggleEnabled = async (row: EventTriggerView) => {
    const next = !(enabledOverride[row.id] ?? row.enabled);
    setEnabledOverride((prev) => ({ ...prev, [row.id]: next }));
    try {
      await mutations.update.mutateAsync({ id: row.id, patch: { enabled: next } });
    } catch {
      // 失败回弹，服务端真值以重拉为准
      setEnabledOverride((prev) => {
        const rest = { ...prev };
        delete rest[row.id];
        return rest;
      });
    }
  };

  return (
    <div className="space-y-2 border-t pt-3" data-testid="custom-trigger-section">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-medium">{t('customTriggers.title')}</h4>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {t('customTriggers.description')}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={openCreate} data-testid="custom-trigger-add">
          {t('customTriggers.addAction')}
        </Button>
      </div>

      {hydrated && (triggers ?? []).length === 0 && (
        <p className="text-[11px] text-muted-foreground" data-testid="custom-trigger-empty">
          {t('customTriggers.empty')}
        </p>
      )}

      <ul className="space-y-1.5">
        {hydrated &&
          (triggers ?? []).map((row) => (
            <li
              key={row.id}
              className="flex items-center gap-3 rounded-md border px-3 py-2"
              data-testid={`custom-trigger-row-${row.id}`}
            >
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0"
                checked={enabledOverride[row.id] ?? row.enabled}
                aria-label={t('customTriggers.enabledLabel')}
                onChange={() => void toggleEnabled(row)}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs">
                  {row.phrases.slice(0, 3).map((phrase) => `「${phrase}」`).join(' ')}
                  {row.phrases.length > 3 ? ` +${row.phrases.length - 3}` : ''}
                </div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {nameOf(row.assistantId)} · {eventTitle(row.eventId)} · {row.maxPerDay}
                  {t('customTriggers.perDaySuffix')} · {row.startHour}-{row.endHour}
                  {t('customTriggers.hourSuffix')}
                </div>
              </div>
              <button
                type="button"
                className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setEditing(row);
                  setDialogOpen(true);
                }}
              >
                {t('common.actions.edit')}
              </button>
              <button
                type="button"
                className="shrink-0 text-xs text-muted-foreground hover:text-destructive"
                onClick={() => void mutations.remove.mutateAsync(row.id)}
              >
                {t('common.actions.delete')}
              </button>
            </li>
          ))}
      </ul>

      <CustomTriggerFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        trigger={editing}
        defaultAssistantId={assistants?.[0]?.id ?? ''}
      />
    </div>
  );
}
