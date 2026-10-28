import type { AgentRunView, WorkSignal } from '@wbfm/shared';
import type { AgentRunEvent } from '../agents/agent-runner';

const TITLE_MAX = 120;

function nowIso(): string {
  return new Date().toISOString();
}

function base(run: AgentRunView): WorkSignal {
  const startedAt = run.createdAt || nowIso();
  return {
    key: `agent:${run.id}`,
    source: 'agent',
    runId: run.id,
    title: run.goal.replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX) || '协作任务',
    outcome: 'running',
    attention: 'none',
    activity: 'thinking',
    stepLabel: null,
    completedSteps: 0,
    totalSteps: null,
    startedAt,
    updatedAt: startedAt,
    endedAt: null,
    errorReason: null,
    deepLink: run.conversationId
      ? `/chat?conversation=${run.conversationId}`
      : `/tasks`,
  };
}

interface AgentPhaseData {
  phase?: string;
  role?: string | null;
  round?: number;
}
interface AgentGateData {
  tool?: string;
  permission?: string;
  argsSummary?: string;
}
interface AgentErrorData {
  message?: string;
  error?: string;
}

function activityForPhase(phase: string | undefined): WorkSignal['activity'] {
  if (phase === 'reviewing') return 'verifying';
  if (phase === 'executing') return 'executing';
  if (phase === 'planning') return 'thinking';
  return 'thinking';
}

/** 单帧 Agent 事件 → WorkSignal；null 表示不影响工作信号 */
export function applyAgentEvent(
  prev: WorkSignal | undefined,
  fallbackRun: AgentRunView,
  event: AgentRunEvent,
): WorkSignal | null {
  const signal: WorkSignal = prev ? { ...prev } : base(fallbackRun);
  signal.updatedAt = nowIso();

  switch (event.event) {
    case 'agent_phase': {
      const data = event.data as AgentPhaseData;
      signal.outcome = 'running';
      signal.attention = 'none';
      signal.activity = activityForPhase(data.phase);
      signal.stepLabel = `第 ${(data.round ?? 0) + 1} 轮 · ${data.role ?? '协作'}`;
      return signal;
    }

    case 'agent_handoff':
      signal.outcome = 'running';
      signal.activity = 'thinking';
      signal.completedSteps += 1;
      return signal;

    case 'agent_review':
      signal.outcome = 'running';
      signal.activity = 'verifying';
      return signal;

    case 'agent_budget':
      signal.attention = 'none';
      signal.activity = 'thinking';
      return signal;

    case 'agent_tool_confirm': {
      const data = event.data as AgentGateData;
      signal.outcome = 'waiting';
      signal.attention = 'approval';
      signal.activity = 'idle';
      signal.stepLabel = `等待工具授权${data.tool ? ` · ${data.tool}` : ''}`;
      return signal;
    }

    case 'done':
      signal.outcome = 'succeeded';
      signal.attention = 'none';
      signal.activity = 'idle';
      signal.endedAt = nowIso();
      signal.stepLabel = null;
      return signal;

    case 'error': {
      const data = event.data as AgentErrorData;
      signal.outcome = 'failed';
      signal.attention = 'none';
      signal.activity = 'idle';
      signal.endedAt = nowIso();
      signal.errorReason = data.message ?? data.error ?? '协作失败';
      return signal;
    }

    default:
      return null;
  }
}
