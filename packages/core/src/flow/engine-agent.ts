import type { FlowEventPayload } from '@wbfm/shared/types';
import {
  AGENT_DESKTOP_SCOPE,
  readAgentBudget,
  readAgentRoleModelIds,
  readAgentToolScopes,
} from './handlers/agent';
import { policyDenyText, type PolicyDecisionReason } from './policy-gate';
import type { FlowExecutionContext } from './types';

/**
 * v1.4 agent 节点引擎子流程（从 engine.ts 外迁以控文件行数）：
 * 发起三角色协作，桥接内部帧为 node_agent_event，
 * 终态产出 summary/status/rounds/evidence/unfinished 供下游引用。
 * 无人值守（api/mcp）声明 desktop 域时按策略默认拒绝（policy-gate 永久禁单）。
 */

type EventBase = { runId: string; workflowId: string };

export async function* runAgentNode(
  nodeId: string,
  config: Record<string, unknown>,
  ctx: FlowExecutionContext,
  base: EventBase,
): AsyncGenerator<FlowEventPayload, Record<string, unknown>> {
  if (!ctx.startAgentCollab) {
    throw new Error('当前运行环境未配置多智能体协作能力（agent 节点不可用）');
  }
  const goal = String(config.goal ?? '').trim();
  if (!goal) throw new Error('agent 节点目标为空（编译期应已拦截）');

  const toolScopes = readAgentToolScopes(config);
  const unattended = ctx.trigger === 'api' || ctx.trigger === 'mcp';
  if (unattended && toolScopes.includes(AGENT_DESKTOP_SCOPE)) {
    throw new Error(policyDenyText('desktop_control_banned', 'mouse_click'));
  }

  const strOrNull = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() ? v.trim() : null;
  const { runId, events } = await ctx.startAgentCollab({
    goal,
    assistantId: strOrNull(config.assistantId),
    knowledgeBaseId: strOrNull(config.knowledgeBaseId),
    toolScopes,
    budget: readAgentBudget(config),
    roleModelIds: readAgentRoleModelIds(config),
    flowRunId: base.runId,
    nodeExecutionId: nodeId,
    ...(ctx.signal ? { signal: ctx.signal } : {}),
  });

  let final;
  for (;;) {
    const step = await events.next();
    if (step.done) {
      final = step.value;
      break;
    }
    const inner = step.value;
    // 内部协作致命错误：升级为节点失败（abort 由引擎外层收尾）
    if (inner.event === 'error') {
      throw new Error(inner.data.message || '协作运行失败');
    }
    yield { type: 'node_agent_event', ...base, nodeId, agentRunId: runId, event: inner };
  }

  const outcome = final.finalOutcome;
  return {
    runId,
    status: final.status,
    // roundNo 为 0 基当前轮；已完成轮次 = roundNo+1
    rounds: final.roundNo + 1,
    summary: outcome?.summary ?? '',
    evidence: outcome?.evidence ?? [],
    unfinished: outcome?.unfinished ?? [],
  };
}
