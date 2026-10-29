'use client';

import * as React from 'react';
import type { SubagentRunStatus, SubagentRunView } from '@wbfm/shared/schemas';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/common/toast';
import { errorText } from '@/lib/i18n/resolve-error';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useCancelSubagentRun } from './use-subagent-runs';

type StatusMeta = {
  key:
    | 'subagent.statusQueued'
    | 'subagent.statusRunning'
    | 'subagent.statusDone'
    | 'subagent.statusFailed'
    | 'subagent.statusCancelled'
    | 'subagent.statusBudgetExceeded';
  variant: 'default' | 'success' | 'danger' | 'warning' | 'outline' | 'info';
};

const STATUS_META: Record<SubagentRunStatus, StatusMeta> = {
  queued: { key: 'subagent.statusQueued', variant: 'outline' },
  running: { key: 'subagent.statusRunning', variant: 'info' },
  done: { key: 'subagent.statusDone', variant: 'success' },
  failed: { key: 'subagent.statusFailed', variant: 'danger' },
  cancelled: { key: 'subagent.statusCancelled', variant: 'default' },
  budget_exceeded: { key: 'subagent.statusBudgetExceeded', variant: 'warning' },
};

const CANCELABLE = new Set<SubagentRunStatus>(['queued', 'running']);

/** v2.11：外部代理运行记录（状态短轮询由父组件查询驱动） */
export function SubagentRunList({ runs }: { runs: SubagentRunView[] }) {
  const { t } = useI18n();
  const toast = useToast();
  const cancel = useCancelSubagentRun();
  const [cancelling, setCancelling] = React.useState<string | null>(null);

  const handleCancel = async (run: SubagentRunView) => {
    setCancelling(run.id);
    try {
      await cancel.mutateAsync(run.id);
    } catch (error) {
      toast.error(errorText(error, t, { fallback: 'subagent.cancelError', withDetail: true }));
    } finally {
      setCancelling(null);
    }
  };

  if (runs.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('subagent.emptyRuns')}</p>;
  }

  return (
    <ul className="space-y-2" data-testid="subagent-run-list">
      {runs.map((run) => {
        const meta = STATUS_META[run.status];
        return (
          <li key={run.id} className="space-y-1 rounded-md border bg-background/60 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={meta.variant}>{t(meta.key)}</Badge>
              <span className="min-w-0 flex-1 truncate text-sm">{run.goal}</span>
              {CANCELABLE.has(run.status) && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={cancelling === run.id}
                  onClick={() => void handleCancel(run)}
                >
                  {t('subagent.cancel')}
                </Button>
              )}
            </div>
            <p className="truncate text-xs text-muted-foreground">{run.cwd}</p>
            {run.errorMessage && (
              <p className="text-xs text-destructive">
                {run.errorCode ? `${run.errorCode}: ` : ''}
                {run.errorMessage}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
