'use client';

import * as React from 'react';
import type { MessageKey } from '@wbfm/shared/i18n';
import type { ScheduledTaskView } from '@wbfm/shared/schemas';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useAssistants } from '@/lib/hooks/use-assistants';
import { useReminderMutations, useReminders } from './use-reminders';
import { ReminderFormDialog } from './reminder-form-dialog';
import { toTimeValue } from './schedule-format';

/**
 * v1.7 角色化提醒管理：列出全部提醒（按助手署名），支持启停/编辑/删除/新建。
 * 与 EventPanel 同口径：挂载门控防水合结构交换；写操作经 react-query 失效重拉。
 */
export function ReminderPanel() {
  const { t } = useI18n();
  const { data: reminders } = useReminders();
  const { data: assistants } = useAssistants();
  const mutations = useReminderMutations();

  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => setHydrated(true), []);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ScheduledTaskView | null>(null);

  const nameOf = (assistantId: string): string =>
    assistants?.find((item) => item.id === assistantId)?.name ?? '—';
  const emojiOf = (assistantId: string): string =>
    assistants?.find((item) => item.id === assistantId)?.emoji ?? '';

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (reminder: ScheduledTaskView) => {
    setEditing(reminder);
    setDialogOpen(true);
  };
  const toggleEnabled = (reminder: ScheduledTaskView) => {
    void mutations.update.mutateAsync({ id: reminder.id, patch: { enabled: !reminder.enabled } });
  };
  const remove = (reminder: ScheduledTaskView) => {
    void mutations.remove.mutateAsync(reminder.id);
  };

  const scheduleLabel = (reminder: ScheduledTaskView): string => {
    const time = toTimeValue(reminder.hour, reminder.minute);
    if (reminder.kind === 'once' && reminder.atDate) {
      return `${reminder.atDate} ${time}`;
    }
    if (reminder.kind === 'weekly' && reminder.weekday !== null) {
      return `${t(`reminders.weekdayShort${reminder.weekday}` as MessageKey)} ${time}`;
    }
    return `${t('reminders.everydayAt')} ${time}`;
  };

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4" data-testid="reminder-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-medium">{t('reminders.title')}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{t('reminders.description')}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={openCreate} data-testid="reminder-add">
          {t('reminders.addAction')}
        </Button>
      </div>

      {hydrated && (reminders ?? []).length === 0 && (
        <p className="text-xs text-muted-foreground" data-testid="reminder-empty">
          {t('reminders.empty')}
        </p>
      )}

      <ul className="space-y-1.5">
        {hydrated &&
          (reminders ?? []).map((reminder) => (
            <li
              key={reminder.id}
              className="flex items-center gap-3 rounded-md border px-3 py-2"
              data-testid={`reminder-row-${reminder.id}`}
            >
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0"
                checked={reminder.enabled}
                aria-label={t('reminders.enabledLabel')}
                data-testid={`reminder-toggle-${reminder.id}`}
                onChange={() => toggleEnabled(reminder)}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{reminder.text}</div>
                <div className="text-[11px] text-muted-foreground">
                  {emojiOf(reminder.assistantId) ? `${emojiOf(reminder.assistantId)} ` : ''}
                  {nameOf(reminder.assistantId)} · {scheduleLabel(reminder)}
                  {!reminder.enabled && onceFired(reminder) && ` · ${t('reminders.statusDone')}`}
                </div>
              </div>
              <button
                type="button"
                className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                data-testid={`reminder-edit-${reminder.id}`}
                onClick={() => openEdit(reminder)}
              >
                {t('common.actions.edit')}
              </button>
              <button
                type="button"
                className="shrink-0 text-xs text-muted-foreground hover:text-destructive"
                data-testid={`reminder-delete-${reminder.id}`}
                onClick={() => remove(reminder)}
              >
                {t('common.actions.delete')}
              </button>
            </li>
          ))}
      </ul>

      <ReminderFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        reminder={editing}
        defaultAssistantId={assistants?.[0]?.id ?? ''}
      />
    </section>
  );
}

/** once 触发后 enabled=0，展示「已完成」态 */
function onceFired(reminder: ScheduledTaskView): boolean {
  return reminder.kind === 'once' && !reminder.enabled;
}
