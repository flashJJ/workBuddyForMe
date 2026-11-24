'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { History, RefreshCw } from 'lucide-react';
import type { MessageKey } from '@wbfm/shared/i18n';
import { Button } from '@/components/ui/button';
import { SimpleSelect } from '@/components/ui/simple-select';
import { PageBody, PageHeader, PageShell } from '@/components/layout/page-header';
import { EmptyState, ErrorState, Spinner } from '@/components/common/state';
import { useToast } from '@/components/common/toast';
import { errorText } from '@/lib/i18n/resolve-error';
import { RUN_OUTCOME_LABEL_KEYS, toOutcome } from '@/lib/runs/run-outcome';
import { useFlowRuns, useFlowRunsHealth, useReplayRun, useReplayRunsBatch, type FlowRunSummary } from '@/lib/hooks/flows';
import { useI18n } from '@/lib/i18n/use-i18n';
import { FlowRunRow } from './flow-run-row';
import { FlowRunsBatchBar } from './flow-runs-batch-bar';
import { FlowRunsHealth } from './flow-runs-health';

const TRIGGER_KEYS: Record<string, MessageKey> = {
  manual: 'flows.runs.trigger.manual',
  chat: 'flows.runs.trigger.chat',
  api: 'flows.runs.trigger.api',
  mcp: 'flows.runs.trigger.mcp',
  schedule: 'flows.runs.trigger.schedule',
  webhook: 'flows.runs.trigger.webhook',
  file: 'flows.runs.trigger.file',
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

const RESUMABLE = new Set(['failed', 'cancelled', 'interrupted']);

export function FlowRunsView() {
  const { t } = useI18n();
  const [trigger, setTrigger] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(new Set());
  const [batchMode, setBatchMode] = React.useState<'snapshot' | 'latest'>('snapshot');
  const [nodeMode, setNodeMode] = React.useState<'whole' | 'failed_node'>('failed_node');
  const [batchSummary, setBatchSummary] = React.useState<string | null>(null);
  const [batchIssues, setBatchIssues] = React.useState<Array<{ runId: string; reason: string }>>([]);
  const runsQuery = useFlowRuns({ trigger: trigger || undefined, status: status || undefined });
  const health = useFlowRunsHealth();
  const replay = useReplayRun();
  const batch = useReplayRunsBatch();
  const toast = useToast();
  const router = useRouter();

  const runs = runsQuery.data?.runs ?? [];
  const nowMs = Date.now();
  const pendingFailures = runs.filter((run) => run.status === 'failed').length;
  const resumableCount = runs.filter((run) => RESUMABLE.has(run.status)).length;

  const toggleSelected = (runId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) next.delete(runId);
      else if (next.size < 20) next.add(runId);
      return next;
    });
  };

  const replaySelected = async () => {
    const runIds = [...selected];
    if (runIds.length === 0) return;
    try {
      const result = await batch.mutateAsync({ runIds, mode: batchMode, nodeMode });
      setBatchSummary(
        t('flowRuns.batch.result', {
          started: result.summary.started,
          skipped: result.summary.skipped,
          failed: result.summary.failed,
        }),
      );
      setBatchIssues(
        result.results
          .filter((item) => !item.ok)
          .map((item) => ({ runId: item.runId, reason: item.reason ?? '' })),
      );
      setSelected(new Set());
      toast.success(t('flowRuns.batch.done', { count: result.summary.started }));
      void runsQuery.refetch();
    } catch (error) {
      toast.error(errorText(error, t, { fallback: 'flowRuns.batch.failed' }));
    }
  };

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
    <PageShell>
      <PageHeader
        icon={<History className="h-4 w-4" />}
        title={t('flows.runs.title')}
        description={t('flows.runs.description')}
        actions={
          <Button variant="outline" size="sm" onClick={() => runsQuery.refetch()}>
            <RefreshCw className="h-3.5 w-3.5" />
            {t('common.actions.refresh')}
          </Button>
        }
      />

      <div className="flex items-center gap-2 border-b bg-ui-card px-6 py-2.5 text-xs">
        <span className="text-muted-foreground">{t('flows.runs.source')}</span>
        <SimpleSelect
          className="h-8 rounded-md border bg-ui-control px-2"
          value={trigger}
          onValueChange={(v) => setTrigger(v)}
        >
          <option value="">{t('common.words.all')}</option>
          <option value="manual">{t(TRIGGER_KEYS.manual!)}</option>
          <option value="chat">{t(TRIGGER_KEYS.chat!)}</option>
          <option value="api">{t(TRIGGER_KEYS.api!)}</option>
          <option value="mcp">{t(TRIGGER_KEYS.mcp!)}</option>
          <option value="schedule">{t(TRIGGER_KEYS.schedule!)}</option>
          <option value="webhook">{t(TRIGGER_KEYS.webhook!)}</option>
          <option value="file">{t(TRIGGER_KEYS.file!)}</option>
        </SimpleSelect>
        <span className="ml-2 text-muted-foreground">{t('common.words.status')}</span>
        <SimpleSelect
          className="h-8 rounded-md border bg-ui-control px-2"
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

      <div className="flex flex-wrap items-center gap-3 border-b bg-ui-card px-6 py-2 text-[11px] text-muted-foreground">
        <span>{t('flowRuns.stats.running', { count: runs.filter((r) => r.status === 'running').length })}</span>
        <span>{t('flowRuns.stats.failed', { count: pendingFailures })}</span>
        <span>{t('flowRuns.stats.resumable', { count: resumableCount })}</span>
        <span>
          {t('flowRuns.compensation.pending')}: {health.data?.compensation.pending ?? 0} ·{' '}
          {t('flowRuns.compensation.exhausted')}: {health.data?.compensation.exhausted ?? 0}
        </span>
      </div>

      <details className="border-b bg-ui-card">
        <summary className="cursor-pointer px-6 py-2 text-[11px] text-muted-foreground">
          {t('flowRuns.health.title')}
        </summary>
        <FlowRunsHealth health={health.data} />
      </details>

      {selected.size > 0 && (
        <FlowRunsBatchBar
          selectedCount={selected.size}
          mode={batchMode}
          nodeMode={nodeMode}
          pending={batch.isPending}
          onModeChange={setBatchMode}
          onNodeModeChange={setNodeMode}
          onReplay={() => void replaySelected()}
          onClear={() => setSelected(new Set())}
        />
      )}
      {batchSummary && (
        <div className="border-b bg-muted/30 px-6 py-1.5 text-[11px] text-muted-foreground">
          {batchSummary}
          {batchIssues.length > 0 && (
            <>
              <p className="mt-1">{t('flowRuns.batch.issues', { count: batchIssues.length })}</p>
              <ul className="space-y-0.5">
                {batchIssues.slice(0, 8).map((issue) => (
                  <li key={issue.runId} className="truncate">
                    {t('flowRuns.batch.issue', { runId: issue.runId, reason: issue.reason })}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <PageBody>
        {runsQuery.isLoading ? (
          <Spinner label={t('flows.runs.loading')} />
        ) : runsQuery.isError ? (
          <ErrorState
            message={t('flows.runs.loadError')}
            onRetry={() => void runsQuery.refetch()}
          />
        ) : runs.length === 0 ? (
          <EmptyState
            icon={<History className="h-8 w-8" />}
            title={t('flows.runs.empty')}
          />
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="w-8 px-2 py-2" />
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
              {runs.map((run) => (
                <FlowRunRow
                  key={run.runId}
                  run={run}
                  nowMs={nowMs}
                  selected={selected.has(run.runId)}
                  selectDisabled={
                    !RESUMABLE.has(run.status) || (selected.size >= 20 && !selected.has(run.runId))
                  }
                  replayPending={replay.isPending}
                  onToggle={() => toggleSelected(run.runId)}
                  onReplay={(nodeId) => void doReplay(run, nodeId)}
                />
              ))}
            </tbody>
          </table>
        )}
      </PageBody>
    </PageShell>
  );
}


