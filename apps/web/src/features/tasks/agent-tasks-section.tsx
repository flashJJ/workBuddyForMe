'use client';

import * as React from 'react';
import { Ban, ChevronRight, Loader2, Users } from 'lucide-react';
import type { AgentRunStatus, AgentRunView } from '@wbfm/shared/schemas';
import { Button } from '@/components/ui/button';
import { SimpleSelect } from '@/components/ui/simple-select';
import { Spinner } from '@/components/common/state';
import { useToast } from '@/components/common/toast';
import { useI18n } from '@/lib/i18n/use-i18n';
import type { MessageKey } from '@wbfm/shared/i18n';
import { errorText } from '@/lib/i18n/resolve-error';
import {
  AgentRunCard,
  StatusBadge,
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

const STATUS_KEY: Record<AgentRunStatus, MessageKey> = {
  running: 'agents.status.running',
  done: 'agents.status.done',
  failed: 'agents.status.failed',
  cancelled: 'agents.status.cancelled',
  budget_exceeded: 'agents.status.budget_exceeded',
};

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
              {s === 'all' ? t('agents.tasks.filterAll') : t(STATUS_KEY[s])}
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
          <StatusBadge status={run.status} />
          <span className="flex-1 truncate text-sm font-medium">{run.goal}</span>
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
