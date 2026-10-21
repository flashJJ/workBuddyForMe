'use client';

import * as React from 'react';
import { Ban, ChevronRight, Loader2, Users } from 'lucide-react';
import type { AgentRunStatus, AgentRunView } from '@wbfm/shared/schemas';
import { Button } from '@/components/ui/button';
import { SimpleSelect } from '@/components/ui/simple-select';
import { FailureHint } from '@/components/common/failure-hint';
import { RunStatusBadge } from '@/components/common/run-status-badge';
import { Spinner } from '@/components/common/state';
import { useToast } from '@/components/common/toast';
import { useI18n } from '@/lib/i18n/use-i18n';
import { errorText } from '@/lib/i18n/resolve-error';
import {
  RUN_OUTCOME_LABEL_KEYS,
  formatDurationMs,
  isLiveOutcome,
  runDurationMs,
  runElapsedMs,
  toOutcome,
} from '@/lib/runs/run-outcome';
import {
  AgentRunCard,
  cardFromRun,
  useAgentRun,
  useAgentRunMutations,
  useAgentRuns,
} from '@/features/agent-collab';

/** v1.4 T4.4：任务中心「协作任务」区段（列表+状态筛选+handoffs 详情展开+急停） */

const STATUS_OPTIONS: Array<AgentRunStatus | 'all'> = [
  'all',
  'running',
  'done',
  'budget_exceeded',
  'failed',
  'cancelled',
];

export function AgentTasksSection() {
  const { t } = useI18n();
  const runsQuery = useAgentRuns();
  const [filter, setFilter] = React.useState<AgentRunStatus | 'all'>('all');
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  const runs = (runsQuery.data ?? []).filter((r) => filter === 'all' || r.status === filter);

  return (
    <section className="px-6 pb-6">
      <div className="mb-2 flex items-center gap-2 pt-4">
        <Users className="h-4 w-4 text-teal-500" />
        <h2 className="text-sm font-semibold">{t('agents.tasks.title')}</h2>
        <span className="text-xs text-muted-foreground">{t('agents.tasks.description')}</span>
        <SimpleSelect
          value={filter}
          onValueChange={(v) => setFilter(v as AgentRunStatus | 'all')}
          className="ml-auto h-8 w-36 text-xs"
          aria-label={t('agents.tasks.filterAll')}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s === 'all' ? t('agents.tasks.filterAll') : t(RUN_OUTCOME_LABEL_KEYS[toOutcome('agent', s)])}
            </option>
          ))}
        </SimpleSelect>
      </div>

      {runsQuery.isLoading ? (
        <Spinner label={t('agents.tasks.loading')} />
      ) : runs.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('agents.tasks.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {runs.map((run) => (
            <AgentRunRow
              key={run.id}
              run={run}
              expanded={expandedId === run.id}
              onToggle={() => setExpandedId((prev) => (prev === run.id ? null : run.id))}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function AgentRunRow({
  run,
  expanded,
  onToggle,
}: {
  run: AgentRunView;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  const detail = useAgentRun(expanded ? run.id : null);
  const mutations = useAgentRunMutations();
  const toast = useToast();
  const active = run.status === 'running';
  const outcome = toOutcome('agent', run.status);
  // agent 视图无 finishedAt：终态用 updatedAt 作为结束时间，与 task/flow 的“结束时间”口径对齐
  const duration = formatDurationMs(
    isLiveOutcome(outcome)
      ? runElapsedMs(run.createdAt, run.updatedAt, Date.now())
      : runDurationMs(run.createdAt, run.updatedAt),
  );

  const cancel = async () => {
    try {
      await mutations.cancel.mutateAsync(run.id);
    } catch (error) {
      toast.error(errorText(error, t, { fallback: 'agents.tasks.loadFailed' }));
    }
  };

  return (
    <li className="min-w-0 overflow-hidden rounded-md border bg-card">
      <div className="flex min-w-0 items-center gap-3 px-4 py-3">
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <ChevronRight
            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`}
          />
          <RunStatusBadge kind="agent" status={run.status} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{run.goal}</span>
            <FailureHint
              compact
              className="mt-0.5"
              outcome={outcome}
              rawError={run.errorMessage}
              code={run.errorCode}
            />
          </span>
          <span className="shrink-0 text-xs text-muted-foreground" title={t('runs.durationHint')}>
            {duration ?? t('runs.durationUnavailable')}
          </span>
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{run.id.slice(0, 8)}</span>
        </button>
        {active && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void cancel()}
            disabled={mutations.cancel.isPending}
          >
            {mutations.cancel.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Ban className="h-3.5 w-3.5" />
            )}
            {t('agents.tasks.cancel')}
          </Button>
        )}
      </div>
      {expanded && (
        <div className="min-w-0 space-y-2 border-t px-4 py-3">
          <p className="min-w-0 break-words text-[11px] text-muted-foreground">
            {t('agents.tasks.runId')}<span className="font-mono">{run.id}</span>
            {run.conversationId && (
              <>
                {' · '}
                {t('agents.tasks.conversation')}<span className="font-mono">{run.conversationId.slice(0, 8)}</span>
              </>
            )}
          </p>
          {detail.data ? (
            <AgentRunCard
              state={cardFromRun(detail.data.run, detail.data.handoffs)}
              runId={run.id}
              compact
              showSummary
            />
          ) : (
            <Spinner label={t('agents.tasks.loading')} />
          )}
        </div>
      )}
    </li>
  );
}
