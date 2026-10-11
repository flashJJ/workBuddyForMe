'use client';

import type {
  AgentBudget,
  AgentBudgetUsage,
  AgentHandoffView,
  AgentPhase,
  AgentRole,
  AgentRunStatus,
  AgentRunView,
  ExecutorOutcome,
  ReviewVerdictPayload,
  SubtaskSpec,
} from '@wbfm/shared/schemas';
import type { SseEvent, SsePayloadMap } from '@wbfm/shared/api';

/**
 * v1.4 M4：协作 SSE 帧 → 泳道卡片视图状态（纯函数，单测锁定）。
 * 聊天任务模式 / Flow 运行子泳道 / 任务中心详情三处共用。
 */

export type AgentStreamFrame =
  | SseEvent<'agent_phase'>
  | SseEvent<'agent_handoff'>
  | SseEvent<'agent_review'>
  | SseEvent<'agent_budget'>
  | SseEvent<'agent_tool_confirm'>
  | SseEvent<'done'>
  | SseEvent<'error'>;

export interface AgentRoundState {
  /** 0 基轮次（与 roundNo/帧 round 对齐） */
  round: number;
  subtask: SubtaskSpec | null;
  outcome: ExecutorOutcome | null;
  review: ReviewVerdictPayload | null;
  /** 本轮最近阶段（泳道高亮；null=本轮已结束） */
  activePhase: AgentPhase | null;
}

export type AgentCardStatus = AgentRunStatus | 'connecting';

export interface AgentCardState {
  status: AgentCardStatus;
  rounds: AgentRoundState[];
  activeRole: AgentRole | null;
  activePhase: AgentPhase | null;
  usage: AgentBudgetUsage | null;
  /** 预算上限（POST /api/agent/runs 返回的 run.budget；历史详情取 run.budget） */
  budget: AgentBudget | null;
  summary: string;
  errorMessage: string | null;
  /** 当前待授权工具（write/danger HITL）；null=无弹窗 */
  pendingConfirm: SsePayloadMap['agent_tool_confirm'] | null;
}

/** 消息/时间线上挂载协作卡的映射值 */
export interface AgentCardEntry {
  runId: string;
  state: AgentCardState;
}

export function initAgentCard(budget: AgentBudget): AgentCardState {
  return {
    status: 'connecting',
    rounds: [],
    activeRole: null,
    activePhase: null,
    usage: null,
    budget,
    summary: '',
    errorMessage: null,
    pendingConfirm: null,
  };
}

function ensureRound(rounds: AgentRoundState[], round: number): AgentRoundState[] {
  if (rounds[round]) return rounds;
  const next = [...rounds];
  for (let i = next.length; i <= round; i += 1) {
    next[i] = { round: i, subtask: null, outcome: null, review: null, activePhase: null };
  }
  return next;
}

function patchRound(
  rounds: AgentRoundState[],
  round: number,
  patch: Partial<AgentRoundState>,
): AgentRoundState[] {
  const base = ensureRound(rounds, round);
  const target = base[round]!;
  const next = [...base];
  next[round] = { ...target, ...patch };
  return next;
}

function applyHandoff(state: AgentCardState, handoff: AgentHandoffView): AgentCardState {
  const r = handoff.roundNo;
  const p = handoff.payload;
  let rounds = state.rounds;
  if (p.subtask) {
    rounds = patchRound(rounds, r, { subtask: p.subtask });
  }
  if (p.outcome) {
    // handoff payload 的 evidence 在 zod 中为 unknown[]，运行时由 core 收敛为 Citation[]
    rounds = patchRound(rounds, r, { outcome: p.outcome as ExecutorOutcome });
  }
  if (p.verdict) {
    const review: ReviewVerdictPayload = {
      verdict: p.verdict,
      acceptanceResults: p.acceptanceResults ?? [],
      ...(p.reviewNotes ? { reviewNotes: p.reviewNotes } : {}),
    };
    rounds = patchRound(rounds, r, { review });
  }
  return { ...state, rounds };
}

/** 终态权威视图合并（done 后 GET /api/agent/runs/:id 对账） */
export function mergeRunView(state: AgentCardState, run: AgentRunView): AgentCardState {
  const status: AgentCardStatus = run.status;
  return {
    ...state,
    status,
    budget: run.budget,
    activeRole: null,
    activePhase: null,
    rounds: state.rounds.map((round) => ({ ...round, activePhase: null })),
    ...(run.finalOutcome ? { summary: run.finalOutcome.summary || state.summary } : {}),
    ...(run.errorMessage ? { errorMessage: run.errorMessage } : {}),
    pendingConfirm: null,
    usage: {
      round: run.roundNo,
      steps: 0,
      promptTokens: run.promptTokens,
      completionTokens: run.completionTokens,
      totalTokens: run.totalTokens,
      ...(state.usage ? { steps: state.usage.steps } : {}),
    },
  };
}

/** 终态回放：run + handoffs 直接构图（任务中心详情 / SSE 终态回放） */
export function cardFromRun(run: AgentRunView, handoffs: AgentHandoffView[]): AgentCardState {
  let state = initAgentCard(run.budget);
  for (const handoff of handoffs) state = applyHandoff(state, handoff);
  return mergeRunView(state, run);
}

export function reduceAgentFrame(state: AgentCardState, frame: AgentStreamFrame): AgentCardState {
  switch (frame.event) {
    case 'agent_phase': {
      const { phase, role, round } = frame.data;
      const terminal = phase === 'done' || phase === 'failed';
      return {
        ...state,
        status: terminal ? state.status : 'running',
        activePhase: terminal ? null : phase,
        activeRole: terminal ? null : role,
        rounds: terminal
          ? state.rounds.map((item) => ({ ...item, activePhase: null }))
          : patchRound(state.rounds, round, { activePhase: phase }),
      };
    }
    case 'agent_handoff':
      return applyHandoff(state, frame.data.handoff);
    case 'agent_review':
      return {
        ...state,
        rounds: patchRound(state.rounds, frame.data.round, { review: frame.data.review }),
      };
    case 'agent_budget':
      return { ...state, usage: frame.data.usage };
    case 'agent_tool_confirm':
      return { ...state, pendingConfirm: frame.data };
    case 'done':
      return {
        ...state,
        summary: frame.data.content || state.summary,
        pendingConfirm: null,
      };
    case 'error':
      return {
        ...state,
        status: 'failed',
        activeRole: null,
        activePhase: null,
        errorMessage: frame.data.message,
        pendingConfirm: null,
      };
    default:
      return state;
  }
}
