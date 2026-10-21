'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { History, RefreshCw, RotateCcw } from 'lucide-react';
import type { MessageKey } from '@wbfm/shared/i18n';
import { Button } from '@/components/ui/button';
import { SimpleSelect } from '@/components/ui/simple-select';
import { FailureHint } from '@/components/common/failure-hint';
import { RunStatusBadge } from '@/components/common/run-status-badge';
import { Spinner } from '@/components/common/state';
import { useToast } from '@/components/common/toast';
import { errorText } from '@/lib/i18n/resolve-error';
import {
  formatDurationMs,
  isLiveOutcome,
  RUN_OUTCOME_LABEL_KEYS,
  runDurationMs,
  runElapsedMs,
  toOutcome,
} from '@/lib/runs/run-outcome';
import { useFlowRuns, useReplayRun, type FlowRunSummary } from '@/lib/hooks/use-flow-runs-center';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useIntl } from '@/lib/i18n/use-intl';

const TRIGGER_KEYS: Record<string, MessageKey> = {
  manual: 'flows.runs.trigger.manual',
  chat: 'flows.runs.trigger.chat',
  api: 'flows.runs.trigger.api',
  mcp: 'flows.runs.trigger.mcp',
};

const STATUS_OPTIONS = [
  'queued',
  'running',
  'waiting_human',
  'succeeded',
  'failed',
  'cancelled',
  'interrupted',
] as const;

export function FlowRunsView() {
  const { t } = useI18n();
  const intl = useIntl();
  const [trigger, setTrigger] = React.useState('');
  const [status, setStatus] = React.useState('');
  const runsQuery = useFlowRuns({ trigger: trigger || undefined, status: status || undefined });
  const replay = useReplayRun();
  const toast = useToast();
  const router = useRouter();

  const runs = runsQuery.data?.runs ?? [];
  const nowMs = Date.now();

  const doReplay = async (run: FlowRunSummary, nodeId?: string) => {
    try {
      const result = await replay.mutateAsync({ runId: run.runId, nodeId });
      toast.success(nodeId ? t('flows.runs.replayedFromNode') : t('flows.runs.replayedWhole'));
      router.push(`/flows/${run.workflowId}?run=${result.runId}`);
    } catch (error) {
      toast.error(errorText(error, t, { fallback: 'flows.runs.replayFailed' }));
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b bg-card px-6 py-4">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <History className="h-4 w-4" />
            {t('flows.runs.title')}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('flows.runs.description')}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => runsQuery.refetch()}>
          <RefreshCw className="h-3.5 w-3.5" />
          {t('common.actions.refresh')}
        </Button>
      </header>

      <div className="flex items-center gap-2 border-b bg-card px-6 py-2.5 text-xs">
        <span className="text-muted-foreground">{t('flows.runs.source')}</span>
        <SimpleSelect
          className="h-8 rounded-md border bg-background px-2"
          value={trigger}
          onValueChange={(v) => setTrigger(v)}
        >
          <option value="">{t('common.words.all')}</option>
          <option value="manual">{t(TRIGGER_KEYS.manual!)}</option>
          <option value="chat">{t(TRIGGER_KEYS.chat!)}</option>
          <option value="api">{t(TRIGGER_KEYS.api!)}</option>
          <option value="mcp">{t(TRIGGER_KEYS.mcp!)}</option>
        </SimpleSelect>
        <span className="ml-2 text-muted-foreground">{t('common.words.status')}</span>
        <SimpleSelect
          className="h-8 rounded-md border bg-background px-2"
          value={status}
          onValueChange={(v) => setStatus(v)}
        >
          <option value="">{t('common.words.all')}</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {t(RUN_OUTCOME_LABEL_KEYS[toOutcome('flow', s)])}
            </option>
          ))}
        </SimpleSelect>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {runsQuery.isLoading ? (
          <Spinner label={t('flows.runs.loading')} />
        ) : runs.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">{t('flows.runs.empty')}</p>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-2 py-2 font-medium">{t('common.words.status')}</th>
                <th className="px-2 py-2 font-medium">{t('flows.runs.workflowColumn')}</th>
                <th className="px-2 py-2 font-medium">{t('flows.runs.source')}</th>
                <th className="px-2 py-2 font-medium">{t('flows.runs.versionColumn')}</th>
                <th className="px-2 py-2 font-medium">{t('flows.runs.timeColumn')}</th>
                <th className="px-2 py-2 font-medium">{t('runs.duration')}</th>
                <th className="px-2 py-2 font-medium">{t('flows.runs.noteColumn')}</th>
                <th className="px-2 py-2 text-right font-medium">{t('common.words.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const outcome = toOutcome('flow', run.status);
                const start = run.startedAt ?? run.createdAt;
                const duration = formatDurationMs(
                  isLiveOutcome(outcome)
                    ? runElapsedMs(start, run.finishedAt, nowMs)
                    : runDurationMs(start, run.finishedAt),
                );
                return (
                <tr key={run.runId} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-2 py-2">
                    <RunStatusBadge kind="flow" status={run.status} />
                  </td>
                  <td className="px-2 py-2">
                    <Link href={`/flows/${run.workflowId}?run=${run.runId}`} className="hover:text-primary">
                      {run.workflowName}
                    </Link>
                    <FailureHint
                      compact
                      className="mt-0.5 max-w-[360px]"
                      outcome={outcome}
                      rawError={run.error?.message}
                      code={run.error?.code}
                    />
                  </td>
                  <td className="px-2 py-2">
                    {TRIGGER_KEYS[run.trigger] ? t(TRIGGER_KEYS[run.trigger]!) : run.trigger}
                  </td>
                  <td className="px-2 py-2 text-muted-foreground">v{run.version}</td>
                  <td className="px-2 py-2 text-muted-foreground">
                    {run.createdAt
                      ? intl.formatDateTime(run.createdAt, {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })
                      : ''}
                  </td>
                  <td className="px-2 py-2 text-muted-foreground" title={t('runs.durationHint')}>
                    {duration ?? t('runs.durationUnavailable')}
                  </td>
                  <td className="px-2 py-2 text-[10px] text-muted-foreground">
                    {run.resumedFromNode ? (
                      <span title={run.parentRunId ?? ''}>
                        {t('flows.runs.replayFromNode', { node: run.resumedFromNode })}
                      </span>
                    ) : run.parentRunId ? (
                      <span title={run.parentRunId}>{t('flows.runs.replayWhole')}</span>
                    ) : (
                      ''
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex justify-end gap-1">
                      {run.replayNodeId && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          disabled={replay.isPending}
                          onClick={() => doReplay(run, run.replayNodeId ?? undefined)}
                          title={t('flows.runs.replayNodeTitle', { node: run.replayNodeId })}
                        >
                          <RotateCcw className="h-3 w-3" />
                          {t('flows.runs.replayNodeButton')}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        disabled={replay.isPending}
                        onClick={() => doReplay(run)}
                        title={t('flows.runs.replayTitle')}
                      >
                        <RotateCcw className="h-3 w-3" />
                        {t('flows.runs.replay')}
                      </Button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}


