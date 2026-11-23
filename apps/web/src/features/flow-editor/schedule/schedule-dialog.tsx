'use client';

import * as React from 'react';
import { Pencil, Play, Plus, Trash2 } from 'lucide-react';
import type { FlowScheduleLastStatus, FlowScheduleView } from '@wbfm/shared/types';
import { FLOW_SCHEDULE_LIMIT } from '@wbfm/shared/schemas';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/common/toast';
import { useI18n } from '@/lib/i18n/use-i18n';
import { ApiClientError } from '@/lib/api/client';
import { useFlowScheduleMutations, useFlowSchedules } from '@/lib/hooks/flows';
import { ScheduleForm } from './schedule-form';
import {
  EMPTY_SCHEDULE_DRAFT,
  formatScheduleTime,
  scheduleLabel,
  timezoneOptionsFor,
  type ScheduleDraft,
} from './schedule-helpers';

export interface ScheduleDialogProps {
  open: boolean;
  workflowId: string;
  published: boolean;
  onClose: () => void;
}

const STATUS_KEYS = {
  created: 'flowEditor.schedule.status.created',
  skipped_busy: 'flowEditor.schedule.status.skipped_busy',
  error: 'flowEditor.schedule.status.error',
  disabled: 'flowEditor.schedule.status.disabled',
} as const;

/** v4.26 定时触发配置：一流程多定时（列表 + 新建/编辑） */
export function ScheduleDialog({ open, workflowId, published, onClose }: ScheduleDialogProps) {
  const { t } = useI18n();
  const toast = useToast();
  const detail = useFlowSchedules(open ? workflowId : null);
  const mutations = useFlowScheduleMutations(workflowId);
  const schedules = detail.data?.schedules ?? [];

  const [editingId, setEditingId] = React.useState<string | 'new' | null>(null);
  const [draft, setDraft] = React.useState<ScheduleDraft>(EMPTY_SCHEDULE_DRAFT);
  const [confirmId, setConfirmId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setEditingId(null);
      setConfirmId(null);
    }
  }, [open]);

  React.useEffect(() => {
    if (detail.error) toast.error(t('flowEditor.schedule.loadFailed'));
  }, [detail.error, t, toast]);

  const saving = mutations.create.isPending || mutations.update.isPending;
  const atLimit = schedules.length >= FLOW_SCHEDULE_LIMIT;
  const statusText = (status: FlowScheduleLastStatus | null) =>
    t(STATUS_KEYS[status ?? 'created']);

  const startCreate = () => {
    setDraft(EMPTY_SCHEDULE_DRAFT);
    setConfirmId(null);
    setEditingId('new');
  };

  const startEdit = (schedule: FlowScheduleView) => {
    setDraft({
      name: schedule.name,
      cron: schedule.cron,
      timezone: schedule.timezone,
      enabled: schedule.enabled,
    });
    setConfirmId(null);
    setEditingId(schedule.id);
  };

  const save = async () => {
    try {
      if (editingId === 'new') {
        await mutations.create.mutateAsync({ ...draft, name: draft.name.trim() });
        toast.success(t('flowEditor.schedule.saved'));
      } else if (editingId) {
        await mutations.update.mutateAsync({
          scheduleId: editingId,
          patch: { ...draft, name: draft.name.trim() },
        });
        toast.success(t('flowEditor.schedule.updated'));
      }
      setEditingId(null);
    } catch (error) {
      const fallback =
        editingId === 'new'
          ? t('flowEditor.schedule.saveFailed')
          : t('flowEditor.schedule.updateFailed');
      toast.error(error instanceof ApiClientError ? error.message : fallback);
    }
  };

  const toggle = async (schedule: FlowScheduleView) => {
    try {
      await mutations.update.mutateAsync({
        scheduleId: schedule.id,
        patch: { enabled: !schedule.enabled },
      });
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : t('flowEditor.schedule.updateFailed'),
      );
    }
  };

  const runNow = async (schedule: FlowScheduleView) => {
    try {
      const result = await mutations.runNow.mutateAsync(schedule.id);
      if (result.runId) toast.success(t('flowEditor.schedule.runStarted'));
      else if (result.reason === 'busy') toast.error(t('flowEditor.schedule.runBusy'));
      else toast.error(t('flowEditor.schedule.runNotPublished'));
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : t('flowEditor.schedule.saveFailed'),
      );
    }
  };

  const remove = async (schedule: FlowScheduleView) => {
    if (confirmId !== schedule.id) {
      setConfirmId(schedule.id);
      return;
    }
    try {
      await mutations.remove.mutateAsync(schedule.id);
      toast.success(t('flowEditor.schedule.removed'));
      if (editingId === schedule.id) setEditingId(null);
      setConfirmId(null);
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : t('flowEditor.schedule.deleteFailed'),
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('flowEditor.schedule.title')}</DialogTitle>
          <DialogDescription>{t('flowEditor.schedule.description')}</DialogDescription>
        </DialogHeader>

        {!published && (
          <p className="rounded bg-warning/10 px-3 py-2 text-xs text-warning">
            {t('flowEditor.schedule.unpublished')}
          </p>
        )}

        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">
            {t('flowEditor.schedule.listTitle')}（{schedules.length}/{FLOW_SCHEDULE_LIMIT}）
          </span>
          {editingId === null && (
            <Button size="sm" variant="outline" onClick={startCreate} disabled={!published || atLimit}>
              <Plus className="h-3.5 w-3.5" />
              {t('flowEditor.schedule.add')}
            </Button>
          )}
        </div>

        {atLimit && !editingId && (
          <p className="text-[11px] text-muted-foreground">{t('flowEditor.schedule.limitReached')}</p>
        )}

        <div className="max-h-64 space-y-1 overflow-auto">
          {schedules.length === 0 && editingId === null && (
            <p className="py-2 text-xs text-muted-foreground">{t('flowEditor.schedule.empty')}</p>
          )}
          {schedules.map((schedule) => (
            <div key={schedule.id} className="space-y-1 rounded border px-2 py-1.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium">{scheduleLabel(schedule)}</span>
                <code className="text-[11px] text-muted-foreground">{schedule.cron}</code>
                <span className="text-[11px] text-muted-foreground">{schedule.timezone}</span>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={schedule.enabled}
                    disabled={!published || editingId !== null}
                    onChange={() => void toggle(schedule)}
                  />
                  {t('flowEditor.schedule.enabled')}
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span>
                  {schedule.enabled
                    ? t('flowEditor.schedule.rowNextRun', {
                        time: formatScheduleTime(schedule.nextRunAt, schedule.timezone),
                      })
                    : t('flowEditor.schedule.status.disabled')}
                </span>
                <span>
                  {schedule.lastRunAt
                    ? t('flowEditor.schedule.rowLastRun', {
                        time: formatScheduleTime(schedule.lastRunAt, schedule.timezone),
                        status: statusText(schedule.lastStatus),
                      })
                    : t('flowEditor.schedule.rowNever')}
                </span>
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2"
                    title={t('flowEditor.schedule.runNow')}
                    onClick={() => void runNow(schedule)}
                    disabled={!published || mutations.runNow.isPending}
                  >
                    <Play className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2"
                    title={t('flowEditor.schedule.edit')}
                    onClick={() => startEdit(schedule)}
                    disabled={!published || saving}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2"
                    onClick={() => void remove(schedule)}
                    disabled={mutations.remove.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {confirmId === schedule.id
                      ? t('flowEditor.schedule.removeInlineConfirm')
                      : t('flowEditor.schedule.remove')}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {editingId !== null && (
          <ScheduleForm
            draft={draft}
            timezones={timezoneOptionsFor(draft.timezone)}
            disabled={!published}
            saving={saving}
            submitLabel={
              editingId === 'new'
                ? t('flowEditor.schedule.saveNew')
                : t('flowEditor.schedule.save')
            }
            onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
            onSubmit={() => void save()}
            onCancel={() => setEditingId(null)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
