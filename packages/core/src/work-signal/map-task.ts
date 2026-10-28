import type { TaskEventPayload, TaskRunView, WorkSignal } from '@wbfm/shared';
import { activityForTool } from '@wbfm/shared';

const TITLE_MAX = 120;

function titleOf(run: TaskRunView): string {
  const goal = run.goal.replace(/\s+/g, ' ').trim();
  return (goal || '任务').slice(0, TITLE_MAX);
}

function nowIso(): string {
  return new Date().toISOString();
}

function base(run: TaskRunView): WorkSignal {
  const startedAt = run.createdAt || nowIso();
  return {
    key: `task:${run.id}`,
    source: 'task',
    runId: run.id,
    title: titleOf(run),
    outcome: 'queued',
    attention: 'none',
    activity: 'thinking',
    stepLabel: null,
    completedSteps: run.stepCount ?? 0,
    totalSteps: run.maxSteps ?? null,
    startedAt,
    updatedAt: startedAt,
    endedAt: null,
    errorReason: null,
    deepLink: `/tasks?run=${run.id}`,
  };
}

/** task 状态 + stopReason → WorkOutcome（与 apps/web/lib/runs/run-outcome 同口径） */
export function taskOutcome(run: TaskRunView): WorkSignal['outcome'] {
  if (run.status === 'completed') return 'succeeded';
  if (run.status === 'failed') return 'failed';
  if (run.status === 'queued') return 'queued';
  if (run.status === 'paused') return 'waiting';
  if (run.status === 'running') return 'running';
  switch (run.stopReason) {
    case 'completed':
      return 'succeeded';
    case 'user_stop':
      return 'cancelled';
    case 'max_steps':
    case 'max_failures':
      return 'budget_exceeded';
    case 'breaker':
    case 'error':
      return 'failed';
    default:
      return 'cancelled';
  }
}

/**
 * 单帧 task 事件 → WorkSignal。返回 null 表示该帧不影响工作信号。
 * 终态帧使用载荷里的 run（若存在）或调用方传入的 run。
 */
export function applyTaskEvent(
  prev: WorkSignal | undefined,
  fallbackRun: TaskRunView,
  event: TaskEventPayload,
): WorkSignal | null {
  const signal: WorkSignal = prev ? { ...prev } : base(fallbackRun);
  const run = event.run ?? fallbackRun;
  signal.title = titleOf(run);
  signal.totalSteps = run.maxSteps ?? signal.totalSteps;
  signal.updatedAt = nowIso();

  switch (event.type) {
    case 'run_started':
      signal.outcome = 'running';
      signal.activity = 'thinking';
      signal.startedAt = run.createdAt || signal.startedAt;
      signal.endedAt = null;
      signal.errorReason = null;
      return signal;

    case 'step_started': {
      const step = event.step;
      if (!step) return null;
      signal.outcome = 'running';
      signal.completedSteps = step.stepIndex;
      signal.activity =
        step.kind === 'observe'
          ? 'reading'
          : step.kind === 'final'
            ? 'thinking'
            : activityForTool(step.toolName);
      signal.stepLabel = `第 ${step.stepIndex + 1} 步${step.toolName ? ` · ${step.toolName}` : ''}`;
      return signal;
    }

    case 'step_finished': {
      const step = event.step;
      if (!step) return null;
      signal.outcome = 'running';
      signal.completedSteps = step.stepIndex + 1;
      signal.activity = 'thinking';
      signal.stepLabel = `第 ${step.stepIndex + 1} 步完成`;
      if (step.status === 'failed' && step.error) signal.errorReason = step.error;
      return signal;
    }

    case 'run_paused':
      signal.outcome = 'waiting';
      signal.attention = 'none';
      signal.activity = 'idle';
      return signal;

    case 'run_resumed':
      signal.outcome = 'running';
      signal.activity = 'thinking';
      return signal;

    case 'run_finished': {
      signal.outcome = taskOutcome(run);
      signal.attention = 'none';
      signal.activity = 'idle';
      signal.completedSteps = run.stepCount ?? signal.completedSteps;
      signal.endedAt = run.finishedAt ?? nowIso();
      signal.errorReason =
        signal.outcome === 'failed' || signal.outcome === 'budget_exceeded'
          ? run.stopReason ?? '任务失败'
          : null;
      return signal;
    }

    default:
      return null;
  }
}
