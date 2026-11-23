import { describe, expect, it } from 'vitest';
import type { AgentRunView, FlowGraph } from '@wbfm/shared/schemas';
import { compileFlow } from '../../compiler/compiler';
import { runFlow } from '../engine';
import type { AgentCollabStartInput, FlowExecutionContext } from '../../graph/types';

function compiledOf(graph: FlowGraph) {
  const result = compileFlow(graph);
  if (!result.compiled) throw new Error('测试图必须编译通过');
  return result.compiled;
}

const node = (id: string, type: 'start' | 'end' | 'agent', config: Record<string, unknown> = {}) => ({
  id,
  type,
  position: { x: 0, y: 0 },
  config,
});
const edge = (source: string, target: string) => ({ id: `e_${source}_${target}`, source, target });

function finalRun(): AgentRunView {
  return {
    id: 'ar-gate',
    conversationId: null,
    flowRunId: 'run1',
    nodeExecutionId: 'ag',
    assistantId: '',
    goal: 'g',
    status: 'done',
    roundNo: 0,
    budget: { maxRounds: 3, maxSteps: 20, maxTotalTokens: 80000 },
    finalOutcome: { summary: 'ok', evidence: [], toolCalls: [], unfinished: [] },
    promptTokens: 1,
    completionTokens: 1,
    totalTokens: 2,
    errorCode: null,
    errorMessage: null,
    createdAt: '',
    updatedAt: '',
  };
}

function mockCollab(calls: AgentCollabStartInput[]): NonNullable<FlowExecutionContext['startAgentCollab']> {
  return async (input) => {
    calls.push(input);
    const events = (async function* () {
      yield { event: 'done' as const, data: { content: 'ok', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } } };
      return finalRun();
    })();
    return { runId: 'ar-gate', events };
  };
}

describe('v5.0 agent 流程级工具门控', () => {
  it('无人值守：写工具被拒绝并写审计，读工具放行', async () => {
    const denied: Array<{ toolName: string; permission: string; reason: string }> = [];
    const calls: AgentCollabStartInput[] = [];
    const graph: FlowGraph = {
      nodes: [
        node('start', 'start'),
        node('ag', 'agent', { goal: 'g', toolScopes: ['knowledge'] }),
        node('end', 'end', {}),
      ],
      edges: [edge('start', 'ag'), edge('ag', 'end')],
    };

    for await (const _event of runFlow(compiledOf(graph), {
      workflowId: 'wf1',
      version: 1,
      runId: 'run1',
      trigger: 'api',
      context: {
        startAgentCollab: mockCollab(calls),
        evaluateUnattended: (toolName, permission) =>
          permission === 'read'
            ? { allowed: true, reason: 'read_ok' }
            : { allowed: false, reason: `policy_deny:${toolName}` },
        auditToolDenied: (input) => denied.push(input),
      },
    })) {
      /* 消费到终态 */
    }

    const gate = calls[0]!.toolGate;
    expect(gate).toBeTruthy();
    expect(gate!('knowledge_search', 'read')).toEqual({ allowed: true });
    const blocked = gate!('file_write', 'write');
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toContain('policy_deny:file_write');
    expect(denied[0]).toMatchObject({ nodeId: 'ag', toolName: 'file_write', permission: 'write' });
  });
});
