'use client';

import Link from 'next/link';
import { RotateCcw } from 'lucide-react';
import type { MessageKey } from '@wbfm/shared/i18n';
import { Button } from '@/components/ui/button';
import { FailureHint } from '@/components/common/failure-hint';
import { RunStatusBadge } from '@/components/common/run-status-badge';
import {
  formatDurationMs,
  isLiveOutcome,
  runDurationMs,
  runElapsedMs,
  toOutcome,
} from '@/lib/runs/run-outcome';
import type { FlowRunSummary } from '@/lib/hooks/flows';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useIntl } from '@/lib/i18n/use-intl';

const TRIGGER_KEYS: Record<string, MessageKey> = {
  manual: 'flows.runs.trigger.manual',
  chat: 'flows.runs.trigger.chat',
  api: 'flows.runs.trigger.api',
  mcp: 'flows.runs.trigger.mcp',
  schedule: 'flows.runs.trigger.schedule',
  webhook: 'flows.runs.trigger.webhook',
  file: 'flows.runs.trigger.file',
};

interface FlowRunRowProps {
  run: FlowRunSummary;
  nowMs: number;
  selected: boolean;
  selectDisabled: boolean;
  replayPending: boolean;
  onToggle: () => void;
  onReplay: (nodeId?: string) => void;
}

/** v5.0 运行中心单行：选择、状态、错误建议、逐条重放 */
export function FlowRunRow(props: FlowRunRowProps) {
  const { t } = useI18n();
  const intl = useIntl();
  const { run } = props;
  const outcome = toOutcome('flow', run.status);
  const start = run.startedAt ?? run.createdAt;
  const duration = formatDurationMs(
    isLiveOutcome(outcome)
      ? runElapsedMs(start, run.finishedAt, props.nowMs)
      : runDurationMs(start, run.finishedAt),
  );

  return (
    <tr className="border-b last:border-0 hover:bg-muted/40">
      <td className="px-2 py-2">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 accent-primary"
          aria-label={t('flowRuns.batch.select')}
          checked={props.selected}
          disabled={props.selectDisabled}
          onChange={props.onToggle}
        />
      </td>
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
        {run.error?.hint && (
          <p className="mt-0.5 max-w-[360px] text-[10px] text-muted-foreground">
            {run.error.hint}
          </p>
        )}
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
              disabled={props.replayPending}
              onClick={() => props.onReplay(run.replayNodeId ?? undefined)}
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
            disabled={props.replayPending}
            onClick={() => props.onReplay()}
            title={t('flows.runs.replayTitle')}
          >
            <RotateCcw className="h-3 w-3" />
            {t('flows.runs.replay')}
          </Button>
        </div>
      </td>
    </tr>
  );
}
