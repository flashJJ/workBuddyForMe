import type { WorkSignal } from '@wbfm/shared';
import type { SubagentRunStatus, SubagentRunView } from '@wbfm/shared/schemas';

const TITLE_MAX = 120;

export function isTerminalSubagentRun(status: SubagentRunStatus): boolean {
  return (
    status === 'done' ||
    status === 'failed' ||
    status === 'cancelled' ||
    status === 'budget_exceeded'
  );
}

/** 外部代理运行 → 工作信号（source=subagent，桌宠/审批页共用） */
export function subagentWorkSignal(
  run: SubagentRunView,
  outcome: WorkSignal['outcome'],
  stepLabel: string | null,
  errorReason: string | null,
  endedAt: string | null = null,
): WorkSignal {
  return {
    key: `subagent:${run.id}`,
    source: 'subagent',
    runId: run.id,
    title: run.goal.replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX) || '外部代理',
    outcome,
    attention: outcome === 'waiting' ? 'approval' : 'none',
    activity: outcome === 'running' ? 'executing' : 'idle',
    stepLabel,
    completedSteps: 0,
    totalSteps: null,
    startedAt: run.createdAt,
    updatedAt: new Date().toISOString(),
    endedAt,
    errorReason,
    deepLink: `/capabilities?run=${run.id}`,
  };
}
