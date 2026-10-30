'use client';

import { AlertTriangle, ChevronRight } from 'lucide-react';
import type { AgentPermissionMode, TaskRunView } from '@wbfm/shared/schemas';
import type { MessageKey } from '@wbfm/shared/i18n';
import { FailureHint } from '@/components/common/failure-hint';
import { RunStatusBadge } from '@/components/common/run-status-badge';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useSystemText } from '@/lib/i18n/use-system-text';
import { formatDurationMs, runElapsedMs, taskOutcome } from '@/lib/runs/run-outcome';
import { useTaskEvents } from '@/lib/hooks/use-tasks';
import { TaskControlBar } from './task-control-bar';
import { TaskTimeline } from './task-timeline';

const MODE_KEYS: Record<AgentPermissionMode, MessageKey> = {
  confirm_each: 'tasks.governance.modes.confirm_each',
  auto_edits: 'tasks.governance.modes.auto_edits',
  smart_approve: 'tasks.governance.modes.smart_approve',
  plan_only: 'tasks.governance.modes.plan_only',
  full_access: 'tasks.governance.modes.full_access',
};

interface TaskRowProps {
  task: TaskRunView;
  expanded: boolean;
  onToggle: () => void;
  assistantName: string;
  conversationTitle: string;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

export function TaskRow({
  task,
  expanded,
  onToggle,
  assistantName,
  conversationTitle,
  onPause,
  onResume,
  onStop,
}: TaskRowProps) {
  const { t } = useI18n();
  const sys = useSystemText();
  const live = useTaskEvents(expanded ? task.id : null);
  const displayRun = live.run ?? task;
  const steps = live.steps.length > 0 ? live.steps : [];
  const isActive = displayRun.status === 'running' || displayRun.status === 'paused';
  const outcome = taskOutcome(displayRun.status, displayRun.stopReason);
  const duration = formatDurationMs(
    runElapsedMs(displayRun.createdAt, displayRun.finishedAt, Date.now()),
  );

  return (
    <li className="min-w-0 overflow-hidden rounded-md border bg-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full min-w-0 items-center gap-3 px-4 py-3 text-left hover:bg-accent/50"
      >
        <ChevronRight
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
        <RunStatusBadge kind="task" status={displayRun.status} stopReason={displayRun.stopReason} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{sys(displayRun.goal)}</span>
          <FailureHint
            compact
            className="mt-0.5"
            outcome={outcome}
            stopReason={displayRun.stopReason}
          />
        </span>
        <span className="text-xs text-muted-foreground" title={t('runs.durationHint')}>
          {duration ?? t('runs.durationUnavailable')}
        </span>
        <span className="text-xs text-muted-foreground">
          {t('tasks.steps', { done: displayRun.stepCount, max: displayRun.maxSteps })}
        </span>
        <span className="text-xs text-muted-foreground">{assistantName}</span>
        <span className="text-xs text-muted-foreground">{conversationTitle}</span>
      </button>
      {expanded && (
        <div className="min-w-0 space-y-3 border-t px-4 py-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              {t('tasks.governance.runMode')}：{t(MODE_KEYS[displayRun.permissionMode])}
            </span>
            {displayRun.workspacePath ? (
              <span className="min-w-0 truncate" title={displayRun.workspacePath}>
                {t('tasks.governance.runWorkspace')}：{displayRun.workspacePath}
              </span>
            ) : null}
          </div>
          {live.status === 'error' && (
            <p className="flex items-center gap-2 text-xs text-warning">
              <AlertTriangle className="h-3 w-3" />
              {t('tasks.eventStreamFailed')}
            </p>
          )}
          {isActive && (
            <TaskControlBar
              status={displayRun.status}
              onPause={onPause}
              onResume={onResume}
              onStop={onStop}
            />
          )}
          <TaskTimeline steps={steps} />
          <a
            href={`/timeline?scope=task&id=${encodeURIComponent(task.id)}`}
            className="inline-flex text-xs text-primary underline-offset-2 hover:underline"
            data-testid={`task-timeline-link-${task.id}`}
          >
            {t('timeline.open')}
          </a>
        </div>
      )}
    </li>
  );
}
