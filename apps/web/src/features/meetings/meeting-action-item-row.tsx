'use client';

import * as React from 'react';
import { Bell, Check, Pencil, Play, RotateCcw, Square, X } from 'lucide-react';
import type { MeetingActionItemUpdateInput } from '@wbfm/shared/schemas';
import type { MeetingActionItemRecord } from '@wbfm/shared/types';
import { Button } from '@/components/ui/button';
import { SimpleSelect } from '@/components/ui/simple-select';
import { useConfirm } from '@/components/common/confirm-dialog';
import { useToast } from '@/components/common/toast';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useIntl } from '@/lib/i18n/use-intl';
import { errorText } from '@/lib/i18n/resolve-error';

interface Member {
  id: string;
  name: string;
  missing?: boolean;
}

interface Props {
  item: MeetingActionItemRecord;
  members: Member[];
  onUpdate: (itemId: string, input: MeetingActionItemUpdateInput) => Promise<void>;
  onToReminder: (itemId: string, assistantId: string) => Promise<void>;
  onRequestRunFlow: (itemId: string) => void;
}

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function ownerValue(item: MeetingActionItemRecord, youLabel: string): string {
  if (item.ownerMemberId) return item.ownerMemberId;
  return item.ownerLabel === youLabel ? '__user__' : '';
}

export function MeetingActionItemRow({
  item,
  members,
  onUpdate,
  onToReminder,
  onRequestRunFlow,
}: Props) {
  const { t } = useI18n();
  const intl = useIntl();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [content, setContent] = React.useState(item.content);
  const [owner, setOwner] = React.useState(() => ownerValue(item, t('meeting.conclusion.you')));
  const [due, setDue] = React.useState(() => toLocalInput(item.dueAt));

  React.useEffect(() => {
    setContent(item.content);
    setOwner(ownerValue(item, t('meeting.conclusion.you')));
    setDue(toLocalInput(item.dueAt));
  }, [item, t]);

  const run = async (
    action: () => Promise<void>,
    fallback: 'meeting.conclusion.updateFailed',
  ): Promise<boolean> => {
    setBusy(true);
    try {
      await action();
      return true;
    } catch (error) {
      toast.error(errorText(error, t, { fallback }));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const setStatus = (status: MeetingActionItemUpdateInput['status']) => {
    void run(() => onUpdate(item.id, { status }), 'meeting.conclusion.updateFailed');
  };

  const save = async () => {
    if (!content.trim()) return;
    const member = members.find((m) => m.id === owner && !m.missing);
    const ownerLabel =
      owner === '__user__'
        ? t('meeting.conclusion.you')
        : member?.name ?? '';
    const ok = await run(
      () =>
        onUpdate(item.id, {
          content: content.trim(),
          ownerLabel,
          ownerMemberId: member?.id ?? null,
          dueAt: due ? new Date(due).toISOString() : null,
        }),
      'meeting.conclusion.updateFailed',
    );
    if (ok) setEditing(false);
  };

  const toReminder = async () => {
    if (!item.dueAt) return;
    const member =
      members.find((m) => m.id === item.ownerMemberId && !m.missing) ??
      members.find((m) => !m.missing);
    if (!member) return;
    const ok = await confirm({
      title: t('meeting.conclusion.reminderTitle'),
      description: t('meeting.conclusion.reminderHint', {
        name: member.name,
        time: intl.formatDateTime(item.dueAt),
        content: item.content,
      }),
      confirmText: t('meeting.conclusion.toReminder'),
    });
    if (!ok) return;
    setBusy(true);
    try {
      await onToReminder(item.id, member.id);
      toast.success(t('meeting.conclusion.reminderLinked'));
    } catch (error) {
      toast.error(errorText(error, t, { fallback: 'meeting.conclusion.reminderFailed' }));
    } finally {
      setBusy(false);
    }
  };

  const cancelled = item.status === 'cancelled';
  const done = item.status === 'done';

  return (
    <div
      className={`rounded-md border p-2 text-sm ${cancelled ? 'opacity-60' : ''}`}
      data-testid="meeting-action-item"
      data-status={item.status}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="mt-0.5 text-teal-600 disabled:opacity-50 dark:text-teal-400"
          disabled={busy || cancelled}
          aria-label={done ? t('meeting.conclusion.markOpen') : t('meeting.conclusion.markDone')}
          title={done ? t('meeting.conclusion.markOpen') : t('meeting.conclusion.markDone')}
          onClick={() => void setStatus(done ? 'open' : 'done')}
        >
          {done ? <Check className="h-4 w-4" /> : <Square className="h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="space-y-2">
              <input
                className="w-full rounded border bg-background px-2 py-1 text-sm"
                value={content}
                aria-label={t('meeting.conclusion.itemPlaceholder')}
                onChange={(event) => setContent(event.target.value)}
              />
              <div className="flex flex-wrap items-center gap-2">
                <SimpleSelect
                  value={owner}
                  onValueChange={setOwner}
                  aria-label={t('meeting.conclusion.owner')}
                  className="w-36"
                >
                  <option value="">{t('meeting.conclusion.ownerNone')}</option>
                  <option value="__user__">{t('meeting.conclusion.you')}</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id} disabled={member.missing}>
                      {member.name}
                    </option>
                  ))}
                </SimpleSelect>
                <input
                  type="datetime-local"
                  className="rounded border bg-background px-2 py-1 text-xs"
                  value={due}
                  aria-label={t('meeting.conclusion.due')}
                  onChange={(event) => setDue(event.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void save()} disabled={busy || !content.trim()}>
                  {t('meeting.conclusion.saveItem')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  {t('meeting.conclusion.cancelEdit')}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <p className="break-words">{item.content}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span>
                  {done
                    ? t('meeting.conclusion.statusDone')
                    : cancelled
                      ? t('meeting.conclusion.statusCancelled')
                      : t('meeting.conclusion.statusOpen')}
                </span>
                {item.ownerLabel && <span>· {item.ownerLabel}</span>}
                <span>· {item.dueAt ? intl.formatDateTime(item.dueAt) : t('meeting.conclusion.noDue')}</span>
                {item.linkedReminderId && <span>· {t('meeting.conclusion.reminderLinked')}</span>}
                {item.linkedFlowRunId && <span>· {t('meeting.conclusion.flowLinked')}</span>}
              </div>
            </>
          )}
        </div>
        {!editing && (
          <div className="flex flex-wrap justify-end gap-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              title={t('meeting.conclusion.editItem')}
              aria-label={t('meeting.conclusion.editItem')}
              onClick={() => setEditing(true)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy || !item.dueAt || Boolean(item.linkedReminderId)}
              title={item.dueAt ? t('meeting.conclusion.toReminder') : t('meeting.conclusion.noDue')}
              aria-label={t('meeting.conclusion.toReminder')}
              onClick={() => void toReminder()}
            >
              <Bell className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy || Boolean(item.linkedFlowRunId)}
              title={t('meeting.conclusion.runFlow')}
              aria-label={t('meeting.conclusion.runFlow')}
              onClick={() => onRequestRunFlow(item.id)}
            >
              <Play className="h-3.5 w-3.5" />
            </Button>
            {cancelled ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                title={t('meeting.conclusion.restoreItem')}
                aria-label={t('meeting.conclusion.restoreItem')}
                onClick={() => void setStatus('open')}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                title={t('meeting.conclusion.cancelItem')}
                aria-label={t('meeting.conclusion.cancelItem')}
                onClick={() => void setStatus('cancelled')}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
