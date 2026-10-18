'use client';

import * as React from 'react';
import type {
  ScheduledTaskCreateInput,
  ScheduledTaskView,
} from '@wbfm/shared/schemas';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SimpleSelect } from '@/components/ui/simple-select';
import { useToast } from '@/components/common/toast';
import { errorText } from '@/lib/i18n/resolve-error';
import { useI18n } from '@/lib/i18n/use-i18n';
import type { MessageKey } from '@wbfm/shared/i18n';
import { useAssistants } from '@/lib/hooks/use-assistants';
import { useReminderMutations } from './use-reminders';
import {
  WEEKDAY_ORDER,
  parseTimeValue,
  toTimeValue,
  todayDateValue,
} from './schedule-format';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 传入则为编辑；null 为新建 */
  reminder: ScheduledTaskView | null;
  /** 新建时默认选中的助手 */
  defaultAssistantId?: string;
}

type Kind = ScheduledTaskCreateInput['kind'];

const KINDS: ReadonlyArray<{ id: Kind; labelKey: MessageKey }> = [
  { id: 'once', labelKey: 'reminders.kindOnce' },
  { id: 'daily', labelKey: 'reminders.kindDaily' },
  { id: 'weekly', labelKey: 'reminders.kindWeekly' },
];

interface FormState {
  assistantId: string;
  kind: Kind;
  time: string;
  weekday: number;
  atDate: string;
  text: string;
  enabled: boolean;
}

function buildForm(reminder: ScheduledTaskView | null, defaultAssistantId: string): FormState {
  if (reminder) {
    return {
      assistantId: reminder.assistantId,
      kind: reminder.kind,
      time: toTimeValue(reminder.hour, reminder.minute),
      weekday: reminder.weekday ?? 1,
      atDate: reminder.atDate ?? todayDateValue(),
      text: reminder.text,
      enabled: reminder.enabled,
    };
  }
  return {
    assistantId: defaultAssistantId,
    kind: 'daily',
    time: '09:00',
    weekday: 1,
    atDate: todayDateValue(),
    text: '',
    enabled: true,
  };
}

export function ReminderFormDialog({ open, onOpenChange, reminder, defaultAssistantId = '' }: Props) {
  const { t } = useI18n();
  const toast = useToast();
  const { data: assistants } = useAssistants();
  const mutations = useReminderMutations();
  const [form, setForm] = React.useState<FormState>(() => buildForm(reminder, defaultAssistantId));
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) setForm(buildForm(reminder, defaultAssistantId));
  }, [open, reminder, defaultAssistantId]);

  const update = (patch: Partial<FormState>) => setForm((prev) => ({ ...prev, ...patch }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsedTime = parseTimeValue(form.time);
    if (!form.assistantId || !parsedTime) return;
    if (form.kind === 'weekly' && form.weekday === undefined) return;
    if (!form.text.trim()) return;
    setSubmitting(true);
    try {
      if (reminder) {
        await mutations.update.mutateAsync({
          id: reminder.id,
          patch: {
            hour: parsedTime.hour,
            minute: parsedTime.minute,
            weekday: form.kind === 'weekly' ? form.weekday : null,
            atDate: form.kind === 'once' ? form.atDate : null,
            text: form.text.trim(),
            enabled: form.enabled,
          },
        });
      } else {
        await mutations.create.mutateAsync({
          assistantId: form.assistantId,
          kind: form.kind,
          hour: parsedTime.hour,
          minute: parsedTime.minute,
          weekday: form.kind === 'weekly' ? form.weekday : null,
          atDate: form.kind === 'once' ? form.atDate : null,
          timezone: 'Asia/Shanghai',
          text: form.text.trim(),
        });
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(errorText(error, t));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {reminder ? t('reminders.editTitle') : t('reminders.createTitle')}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3" data-testid="reminder-form">
          <label className="block space-y-1">
            <span className="text-sm font-medium">{t('reminders.assistantLabel')}</span>
            <SimpleSelect
              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm disabled:opacity-60"
              value={form.assistantId}
              disabled={Boolean(reminder)}
              data-testid="reminder-assistant"
              onValueChange={(v) => update({ assistantId: v })}
            >
              <option value="" disabled>
                {t('reminders.assistantPlaceholder')}
              </option>
              {(assistants ?? []).map((assistant) => (
                <option key={assistant.id} value={assistant.id}>
                  {assistant.emoji ? `${assistant.emoji} ` : ''}
                  {assistant.name}
                </option>
              ))}
            </SimpleSelect>
          </label>

          <div className="space-y-1">
            <span className="text-sm font-medium">{t('reminders.repeatLabel')}</span>
            <div className="flex gap-1.5" role="radiogroup">
              {KINDS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={form.kind === item.id}
                  data-testid={`reminder-kind-${item.id}`}
                  onClick={() => update({ kind: item.id })}
                  className={`rounded-md border px-2.5 py-1 text-xs ${
                    form.kind === item.id
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {t(item.labelKey)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <label className="space-y-1">
              <span className="text-sm font-medium">{t('reminders.timeLabel')}</span>
              <input
                type="time"
                value={form.time}
                required
                data-testid="reminder-time"
                onChange={(e) => update({ time: e.target.value })}
                className="block rounded-md border bg-background px-2 py-1.5 text-sm"
              />
            </label>
            {form.kind === 'weekly' && (
              <label className="space-y-1">
                <span className="text-sm font-medium">{t('reminders.weekdayLabel')}</span>
                <SimpleSelect
                  value={String(form.weekday)}
                  data-testid="reminder-weekday"
                  onValueChange={(v) => update({ weekday: Number(v) })}
                  className="block rounded-md border bg-background px-2 py-1.5 text-sm"
                >
                  {WEEKDAY_ORDER.map((day) => (
                    <option key={day} value={day}>
                      {t(`reminders.weekdayShort${day}` as MessageKey)}
                    </option>
                  ))}
                </SimpleSelect>
              </label>
            )}
            {form.kind === 'once' && (
              <label className="space-y-1">
                <span className="text-sm font-medium">{t('reminders.dateLabel')}</span>
                <input
                  type="date"
                  value={form.atDate}
                  required
                  data-testid="reminder-date"
                  onChange={(e) => update({ atDate: e.target.value })}
                  className="block rounded-md border bg-background px-2 py-1.5 text-sm"
                />
              </label>
            )}
          </div>

          <label className="block space-y-1">
            <span className="text-sm font-medium">{t('reminders.textLabel')}</span>
            <textarea
              value={form.text}
              required
              maxLength={200}
              rows={2}
              data-testid="reminder-text"
              placeholder={t('reminders.textPlaceholder')}
              onChange={(e) => update({ text: e.target.value })}
              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            />
          </label>

          {reminder && (
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={form.enabled}
                onChange={(e) => update({ enabled: e.target.checked })}
              />
              {t('reminders.enabledLabel')}
            </label>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.actions.cancel')}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? t('reminders.saving') : t('common.actions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
