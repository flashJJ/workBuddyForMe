import type { FlowEventPayload, WorkSignal, WorkflowRunView } from '@wbfm/shared';

const TITLE_MAX = 120;

function nowIso(): string {
  return new Date().toISOString();
}

function base(run: WorkflowRunView, title: string): WorkSignal {
  const startedAt = run.startedAt ?? run.createdAt;
  return {
    key: `flow:${run.id}`,
    source: 'flow',
    runId: run.id,
    title: title.replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX) || '工作流',
    outcome: 'queued',
    attention: 'none',
    activity: 'thinking',
    stepLabel: null,
    completedSteps: 0,
    totalSteps: null,
    startedAt,
    updatedAt: startedAt,
    endedAt: null,
    errorReason: null,
    deepLink: `/flows/${run.workflowId}?run=${run.id}`,
  };
}

function activityForNode(nodeType: string): WorkSignal['activity'] {
  const type = nodeType.toLowerCase();
  if (/(knowledge|retriev|search)/.test(type)) return 'searching';
  if (/(agent|chat|llm|model)/.test(type)) return 'thinking';
  if (/(human|approval)/.test(type)) return 'idle';
  return 'executing';
}

/** 单帧 Flow 事件 → WorkSignal；null 表示不影响工作信号 */
export function applyFlowEvent(
  prev: WorkSignal | undefined,
  fallbackRun: WorkflowRunView,
  event: FlowEventPayload,
  title: string,
): WorkSignal | null {
  const signal: WorkSignal = prev ? { ...prev } : base(fallbackRun, title);
  signal.title = title.replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX) || signal.title;
  signal.updatedAt = nowIso();

  switch (event.type) {
    case 'run_started':
      signal.outcome = 'running';
      signal.activity = 'thinking';
      signal.startedAt = fallbackRun.startedAt ?? signal.startedAt;
      signal.endedAt = null;
      signal.errorReason = null;
      return signal;

    case 'node_started':
      signal.outcome = 'running';
      signal.activity = activityForNode(event.nodeType);
      signal.stepLabel = `${event.nodeId} 执行中`;
      signal.attention = event.nodeType === 'human' ? 'input' : 'none';
      if (signal.attention === 'input') signal.outcome = 'waiting';
      return signal;

    case 'node_succeeded':
      signal.outcome = 'running';
      signal.activity = 'thinking';
      signal.completedSteps += 1;
      signal.stepLabel = `${event.nodeId} 完成`;
      signal.attention = 'none';
      return signal;

    case 'node_skipped':
      signal.completedSteps += 1;
      signal.stepLabel = `${event.nodeId} 跳过`;
      return signal;

    case 'node_waiting_human':
      signal.outcome = 'waiting';
      signal.attention = 'input';
      signal.activity = 'idle';
      signal.stepLabel = `${event.nodeId} 等待人工审核`;
      return signal;

    case 'node_failed':
      // 节点失败可能被错误分支继续处理，先记录原因，终态由 run_failed 决定
      signal.activity = 'thinking';
      signal.errorReason = event.message;
      signal.stepLabel = `${event.nodeId} 失败`;
      return signal;

    case 'node_agent_event': {
      const phase = (event.event as { event?: string } | null)?.event;
      signal.activity = phase === 'agent_review' ? 'verifying' : 'thinking';
      signal.stepLabel = `${event.nodeId} 协作中`;
      return signal;
    }

    case 'run_succeeded':
      signal.outcome = 'succeeded';
      signal.attention = 'none';
      signal.activity = 'idle';
      signal.endedAt = nowIso();
      signal.stepLabel = null;
      return signal;

    case 'run_failed':
      signal.outcome = 'failed';
      signal.attention = 'none';
      signal.activity = 'idle';
      signal.endedAt = nowIso();
      signal.errorReason = event.message;
      return signal;

    case 'run_cancelled':
      signal.outcome = 'cancelled';
      signal.attention = 'none';
      signal.activity = 'idle';
      signal.endedAt = nowIso();
      return signal;

    default:
      return null;
  }
}
