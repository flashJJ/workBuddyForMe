import { describe, expect, it, vi } from 'vitest';
import type { AgentNodeInnerEvent, FlowEventPayload } from '@wbfm/shared/types';
import type { AgentRunView, FlowGraph, FlowNodeType } from '@wbfm/shared/schemas';
import { compileFlow } from './compiler';
import { runFlow } from './engine';
import type { AgentCollabStartInput, FlowExecutionContext } from './types';

async function collect(gen: AsyncGenerator<FlowEventPayload>): Promise<FlowEventPayload[]> {
  const events: FlowEventPayload[] = [];
  for await (const event of gen) events.push(event);
  return events;
}

function compiledOf(graph: FlowGraph) {
  const result = compileFlow(graph);
  if (!result.compiled) throw new Error('测试图必须编译通过');
  return result.compiled;
}

const node = (id: string, type: FlowNodeType, config: Record<string, unknown> = {}) => ({
  id,
  type,
  position: { x: 0, y: 0 },
  config,
});
const edge = (source: string, target: string) => ({ id: `e_${source}_${target}`, source, target });

function finalRun(overrides: Partial<AgentRunView> = {}): AgentRunView {
  return {
    id: 'ar1',
    conversationId: null,
    flowRunId: 'run1',
    nodeExecutionId: 'ag',
    assistantId: '',
    goal: 'g',
    status: 'done',
    roundNo: 0,
    budget: { maxRounds: 3, maxSteps: 20, maxTotalTokens: 80000 },
    finalOutcome: {
      summary: '年假 15 天',
      evidence: [{ documentId: 'd1', documentName: '制度.pdf', ordinal: 1 }],
      toolCalls: ['knowledge_search'],
      unfinished: [],
    },
    promptTokens: 10,
    completionTokens: 5,
    totalTokens: 15,
    errorCode: null,
    errorMessage: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

const phaseEvent = (round: number): AgentNodeInnerEvent => ({
  event: 'agent_phase',
  data: { runId: 'ar1', phase: 'planning', role: 'planner', round },
});
const doneEvent: AgentNodeInnerEvent = {
  event: 'done',
  data: { content: '年假 15 天', usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } },
};

/** 构造 mock startAgentCollab；捕获入参与透传 signal */
function mockCollab(params: {
  final?: AgentRunView;
  events?: AgentNodeInnerEvent[];
  onStart?: (input: AgentCollabStartInput) => void;
}): {
  cb: NonNullable<FlowExecutionContext['startAgentCollab']>;
  calls: AgentCollabStartInput[];
} {
  const calls: AgentCollabStartInput[] = [];
  const cb: NonNullable<FlowExecutionContext['startAgentCollab']> = async (input) => {
    calls.push(input);
    params.onStart?.(input);
    const final = params.final ?? finalRun();
    const queue = params.events ?? [phaseEvent(0), doneEvent];
    const events = (async function* () {
      for (const ev of queue) yield ev;
      return final;
    })();
    return { runId: final.id, events };
  };
  return { cb, calls };
}

describe('runFlow：v1.4 agent 节点', () => {
  it('桥接内部协作帧、回填 flow 归属、产出 summary/status/rounds 供引用', async () => {
    const { cb, calls } = mockCollab({});
    const graph: FlowGraph = {
      nodes: [
        node('start', 'start'),
        node('ag', 'agent', {
          goal: '{{$nodes.start.params.topic}} 的年假天数',
          assistantId: null,
          knowledgeBaseId: 'kb1',
          toolScopes: ['knowledge', 'mcp:x', 'knowledge'],
          maxRounds: 2,
          plannerModelId: 'm-p',
        }),
        node('end', 'end', { output: '{{$nodes.ag.outputs.summary}}' }),
      ],
      edges: [edge('start', 'ag'), edge('ag', 'end')],
    };

    const events = await collect(
      runFlow(compiledOf(graph), {
        workflowId: 'wf1',
        version: 1,
        runId: 'run1',
        input: { topic: '员工' },
        context: { startAgentCollab: cb },
      }),
    );

    // 入参：引用插值/scope 去重保序/预算与角色模型解析
    expect(calls[0]!.goal).toBe('员工 的年假天数');
    expect(calls[0]!.toolScopes).toEqual(['knowledge', 'mcp:x']);
    expect(calls[0]!.budget).toEqual({ maxRounds: 2 });
    expect(calls[0]!.roleModelIds).toEqual({ planner: 'm-p', executor: null, reviewer: null });
    expect(calls[0]!.knowledgeBaseId).toBe('kb1');
    expect(calls[0]!.flowRunId).toBe('run1');
    expect(calls[0]!.nodeExecutionId).toBe('ag');

    const agentEvents = events.filter((e) => e.type === 'node_agent_event');
    expect(agentEvents.length).toBeGreaterThan(0);
    expect(agentEvents[0]).toMatchObject({
      type: 'node_agent_event',
      nodeId: 'ag',
      agentRunId: 'ar1',
    });

    const succeeded = events.find(
      (e): e is Extract<FlowEventPayload, { type: 'node_succeeded' }> =>
        e.type === 'node_succeeded' && e.nodeId === 'ag',
    );
    expect(succeeded?.outputs).toMatchObject({
      runId: 'ar1',
      status: 'done',
      rounds: 1,
      summary: '年假 15 天',
      evidence: [{ documentId: 'd1', ordinal: 1 }],
    });
    expect(events.at(-1)).toMatchObject({ type: 'run_succeeded', output: '年假 15 天' });
  });

  it('goal 引用解析后原样传给协作（含整字段 $ref 形态）', async () => {
    const { cb, calls } = mockCollab({});
    const graph: FlowGraph = {
      nodes: [
        node('start', 'start'),
        node('ag', 'agent', { goal: { $ref: 'nodes.start.params.goal' } }),
        node('end', 'end', { output: '{{$nodes.ag.outputs.status}}' }),
      ],
      edges: [edge('start', 'ag'), edge('ag', 'end')],
    };
    const events = await collect(
      runFlow(compiledOf(graph), {
        workflowId: 'wf1',
        version: 1,
        runId: 'run1',
        input: { goal: '查证报销制度' },
        context: { startAgentCollab: cb },
      }),
    );
    expect(calls[0]!.goal).toBe('查证报销制度');
    expect(events.at(-1)).toMatchObject({ type: 'run_succeeded', output: 'done' });
  });

  it('未配置协作能力时节点失败（明确错误）', async () => {
    const graph: FlowGraph = {
      nodes: [node('start', 'start'), node('ag', 'agent', { goal: 'g' }), node('end', 'end', {})],
      edges: [edge('start', 'ag'), edge('ag', 'end')],
    };
    const events = await collect(
      runFlow(compiledOf(graph), { workflowId: 'wf1', version: 1, runId: 'run1' }),
    );
    const failed = events.find((e) => e.type === 'node_failed');
    expect(failed).toMatchObject({ nodeId: 'ag' });
    expect((failed as { message: string }).message).toContain('协作');
  });

  it('内部协作 error 帧升级为节点失败', async () => {
    const errorFrame: AgentNodeInnerEvent = {
      event: 'error',
      data: { code: 'INTERNAL_ERROR', message: '协作内部爆炸' },
    };
    const { cb } = mockCollab({ events: [phaseEvent(0), errorFrame] });
    const graph: FlowGraph = {
      nodes: [node('start', 'start'), node('ag', 'agent', { goal: 'g' }), node('end', 'end', {})],
      edges: [edge('start', 'ag'), edge('ag', 'end')],
    };
    const events = await collect(
      runFlow(compiledOf(graph), {
        workflowId: 'wf1',
        version: 1,
        runId: 'run1',
        context: { startAgentCollab: cb },
      }),
    );
    const failed = events.find((e) => e.type === 'node_failed');
    expect((failed as { message: string }).message).toContain('协作内部爆炸');
    // 错误帧不再作为 node_agent_event 桥接
    expect(events.some((e) => e.type === 'node_succeeded' && e.nodeId === 'ag')).toBe(false);
  });

  it('T3.5 无人值守（api/mcp）+ desktop 域：策略默认拒绝，节点失败且不发起协作', async () => {
    const onStart = vi.fn();
    const { cb } = mockCollab({ onStart });
    const graph: FlowGraph = {
      nodes: [
        node('start', 'start'),
        node('ag', 'agent', { goal: 'g', toolScopes: ['desktop'] }),
        node('end', 'end', {}),
      ],
      edges: [edge('start', 'ag'), edge('ag', 'end')],
    };
    const events = await collect(
      runFlow(compiledOf(graph), {
        workflowId: 'wf1',
        version: 1,
        runId: 'run1',
        trigger: 'api',
        context: { startAgentCollab: cb },
      }),
    );
    const failed = events.find((e) => e.type === 'node_failed');
    expect((failed as { message: string }).message).toContain('desktop_control_banned');
    expect(onStart).not.toHaveBeenCalled();
  });

  it('画布人工试运行（manual）含 desktop 域可正常发起；取消信号透传给协作', async () => {
    let capturedSignal: AbortSignal | undefined;
    const { cb } = mockCollab({ onStart: (input) => void (capturedSignal = input.signal) });
    const controller = new AbortController();
    const graph: FlowGraph = {
      nodes: [
        node('start', 'start'),
        node('ag', 'agent', { goal: 'g', toolScopes: ['desktop'] }),
        node('end', 'end', {}),
      ],
      edges: [edge('start', 'ag'), edge('ag', 'end')],
    };
    const eventsPromise = collect(
      runFlow(compiledOf(graph), {
        workflowId: 'wf1',
        version: 1,
        runId: 'run1',
        trigger: 'manual',
        signal: controller.signal,
        context: { startAgentCollab: cb },
      }),
    );
    const events = await eventsPromise;
    expect(capturedSignal).toBe(controller.signal);
    expect(events.at(-1)?.type).toBe('run_succeeded');
  });
});
