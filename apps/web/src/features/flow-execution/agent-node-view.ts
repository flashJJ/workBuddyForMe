import type { FlowEventPayload } from '@wbfm/shared/types';
import { AGENT_BUDGET_DEFAULTS, type AgentBudget } from '@wbfm/shared/schemas';
import { initAgentCard, reduceAgentFrame, type AgentCardState, type AgentCardStatus } from '../agent-collab';
import type { FlowCanvasNode } from '../flow-editor/graph-utils';

/**
 * v1.4 M4：Flow 试运行事件 → agent 节点子泳道视图（从 execution-timeline 外迁控行数）。
 * 预算上限取节点配置（缺省回落协作默认）；终态枚举以 node_succeeded 输出/失败事件为准。
 */

type AgentEvent = Extract<FlowEventPayload, { type: 'node_agent_event' }>;

function budgetFromConfig(config: Record<string, unknown> | undefined): AgentBudget {
  const num = (v: unknown, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    maxRounds: num(config?.maxRounds, AGENT_BUDGET_DEFAULTS.maxRounds),
    maxSteps: num(config?.maxSteps, AGENT_BUDGET_DEFAULTS.maxSteps),
    maxTotalTokens: num(config?.maxTotalTokens, AGENT_BUDGET_DEFAULTS.maxTotalTokens),
  };
}

export interface AgentNodeView {
  runId: string;
  state: AgentCardState;
}

export function buildAgentView(
  events: FlowEventPayload[],
  node: FlowCanvasNode | undefined,
): AgentNodeView | null {
  const agentEvents = events.filter((e): e is AgentEvent => e.type === 'node_agent_event');
  const succeeded = events.find(
    (e): e is Extract<FlowEventPayload, { type: 'node_succeeded' }> => e.type === 'node_succeeded',
  );
  const failed = events.find(
    (e): e is Extract<FlowEventPayload, { type: 'node_failed' }> => e.type === 'node_failed',
  );
  if (agentEvents.length === 0 && !succeeded && !failed) return null;

  const runId = agentEvents[0]?.agentRunId ?? '';
  let state = initAgentCard(budgetFromConfig(node?.data.config));
  for (const e of agentEvents) state = reduceAgentFrame(state, e.event);

  if (succeeded) {
    const outputs = succeeded.outputs as { status?: AgentCardStatus; summary?: string } | undefined;
    if (outputs?.status) state = { ...state, status: outputs.status };
    if (outputs?.summary) state = { ...state, summary: outputs.summary };
  }
  if (failed) {
    state = { ...state, status: 'failed', errorMessage: failed.message };
  }
  return { runId, state };
}
