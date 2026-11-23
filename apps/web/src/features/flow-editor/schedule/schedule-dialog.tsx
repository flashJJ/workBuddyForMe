'use client';

import * as React from 'react';
import type { FlowScheduleView } from '@wbfm/shared/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/common/toast';
import { useI18n } from '@/lib/i18n/use-i18n';
import { ApiClientError } from '@/lib/api/client';
import { useFlowSchedule, useFlowScheduleMutations } from '@/lib/hooks/flows';

export interface ScheduleDialogProps {
  open: boolean;
  workflowId: string;
  published: boolean;
  onClose: () => void;
}

const DEFAULT_CRON = '0 9 * * *';

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

/** v4.24 定时触发配置：cron、启用、下次/上次运行、立即运行与删除 */
export function ScheduleDialog({ open, workflowId, published, onClose }: ScheduleDialogProps) {
  const { t } = useI18n();
  const toast = useToast();
  const detail = useFlowSchedule(open ? workflowId : null);
  const mutations = useFlowScheduleMutations(workflowId);
  const schedule: FlowScheduleView | null = detail.data?.schedule ?? null;

  const [cron, setCron] = React.useState(DEFAULT_CRON);
  const [enabled, setEnabled] = React.useState(true);
  const [confirmingRemove, setConfirmingRemove] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setConfirmingRemove(false);
      return;
    }
    setCron(schedule?.cron ?? DEFAULT_CRON);
    setEnabled(schedule?.enabled ?? true);
  }, [open, schedule]);

  React.useEffect(() => {
    if (detail.error) toast.error(t('flowEditor.schedule.loadFailed'));
  }, [detail.error, t, toast]);

  const save = async () => {
    try {
      await mutations.save.mutateAsync({ cron, enabled });
      toast.success(t('flowEditor.schedule.saved'));
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : t('flowEditor.schedule.saveFailed'));
    }
  };

  const runNow = async () => {
    try {
      const result = await mutations.runNow.mutateAsync();
      if (result.runId) toast.success(t('flowEditor.schedule.runStarted'));
      else if (result.reason === 'busy') toast.error(t('flowEditor.schedule.runBusy'));
      else toast.error(t('flowEditor.schedule.runNotPublished'));
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : t('flowEditor.schedule.saveFailed'));
    }
  };

  const remove = async () => {
    if (!confirmingRemove) {
      setConfirmingRemove(true);
      return;
    }
    try {
      await mutations.remove.mutateAsync();
      toast.success(t('flowEditor.schedule.removed'));
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : t('flowEditor.schedule.deleteFailed'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('flowEditor.schedule.title')}</DialogTitle>
          <DialogDescription>{t('flowEditor.schedule.description')}</DialogDescription>
        </DialogHeader>

        {!published && (
          <p className="rounded bg-warning/10 px-3 py-2 text-xs text-warning">
            {t('flowEditor.schedule.unpublished')}
          </p>
        )}

        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium">{t('flowEditor.schedule.cronLabel')}</span>
            <Input
              value={cron}
              onChange={(event) => setCron(event.target.value)}
              placeholder="0 9 * * *"
              disabled={!published}
              spellCheck={false}
            />
            <span className="block text-[11px] text-muted-foreground">{t('flowEditor.schedule.cronHint')}</span>
          </label>

          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={enabled}
              disabled={!published}
              onChange={(event) => setEnabled(event.target.checked)}
            />
            {t('flowEditor.schedule.enabled')}
          </label>

          <div className="space-y-1 rounded bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
            <p>{t('flowEditor.schedule.nextRun', { time: formatTime(schedule?.nextRunAt ?? null) })}</p>
            <p>
              {schedule?.lastRunAt
                ? t('flowEditor.schedule.lastRun', {
                    time: formatTime(schedule.lastRunAt),
                    status: t(
                      `flowEditor.schedule.status.${schedule.lastStatus ?? 'created'}` as
                        | 'flowEditor.schedule.status.created'
                        | 'flowEditor.schedule.status.skipped_busy'
                        | 'flowEditor.schedule.status.error'
                        | 'flowEditor.schedule.status.disabled',
                    ),
                  })
                : t('flowEditor.schedule.neverRun')}
            </p>
          </div>
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={remove} disabled={!schedule || mutations.remove.isPending}>
            {confirmingRemove ? t('flowEditor.schedule.removeConfirm') : t('flowEditor.schedule.remove')}
          </Button>
          <Button variant="outline" size="sm" onClick={runNow} disabled={!published || mutations.runNow.isPending}>
            {t('flowEditor.schedule.runNow')}
          </Button>
          <Button size="sm" onClick={save} disabled={!published || mutations.save.isPending}>
            {t('flowEditor.schedule.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
