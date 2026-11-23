import { describe, expect, it, vi } from 'vitest';
import type { FlowGraph } from '@wbfm/shared/schemas';
import type { FlowNodeHandler } from '../../graph/types';
import { runFlow } from '../engine';
import { collect, compiledOf, e, n } from '../engine-branch.helpers';
import type { FlowCheckpoint } from '../../graph/types';

const opts = { workflowId: 'w', version: 1, runId: 'r1' };
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function chain(): FlowGraph {
  return {
    nodes: [
      n('start', 'start'),
      n('A', 'llm', { tag: 'A' }),
      n('end', 'end', { output: '{{$nodes.A.outputs.text}}' }),
    ],
    edges: [e('e1', 'start', 'A'), e('e2', 'A', 'end')],
  };
}

function llmOf(run: (config: Record<string, unknown>) => Promise<unknown>): FlowNodeHandler {
  return { type: 'llm', run: run as FlowNodeHandler['run'] };
}

describe('v4.23 checkpoint 续跑', () => {
  it('已成功节点静默跳过，不重复执行且复用输出', async () => {
    const handler = vi.fn(async () => ({ text: 'A' }));
    const checkpoint: FlowCheckpoint = {
      runId: 'r1',
      lastSucceededNodeId: 'A',
      nodes: [
        { nodeId: 'start', status: 'succeeded', outputs: {} },
        { nodeId: 'A', status: 'succeeded', outputs: { text: 'A' } },
      ],
    };
    const events = await collect(
      runFlow(compiledOf(chain()), {
        ...opts,
        checkpoint,
        resumeReason: 'safe_in_flight',
        handlers: { llm: llmOf(handler) },
      }),
    );

    expect(handler).not.toHaveBeenCalled();
    expect(events[0]).toMatchObject({ type: 'run_started', resumed: true, resumeReason: 'safe_in_flight' });
    expect(
      events.filter((x) => x.type === 'node_started').map((x) => (x as { nodeId: string }).nodeId),
    ).toEqual(['end']);
    expect(events.find((x) => x.type === 'run_succeeded')).toMatchObject({ output: 'A' });
  });

  it('condition 分支边随 checkpoint 重建，未命中分支仍跳过', async () => {
    const graph: FlowGraph = {
      nodes: [
        n('start', 'start'),
        n('cond', 'condition', { expression: 'true' }),
        n('T', 'llm', { tag: 'T' }),
        n('F', 'llm', { tag: 'F' }),
        n('endT', 'end', { output: '{{$nodes.T.outputs.text}}' }),
        n('endF', 'end', { output: '{{$nodes.F.outputs.text}}' }),
      ],
      edges: [
        e('e1', 'start', 'cond'),
        e('e2', 'cond', 'T', 'true'),
        e('e3', 'cond', 'F', 'false'),
        e('e4', 'T', 'endT'),
        e('e5', 'F', 'endF'),
      ],
    };
    const llm = vi.fn(async (config: Record<string, unknown>) => ({ text: String(config.tag) }));
    const checkpoint: FlowCheckpoint = {
      runId: 'r1',
      lastSucceededNodeId: 'cond',
      nodes: [
        { nodeId: 'start', status: 'succeeded', outputs: {} },
        { nodeId: 'cond', status: 'succeeded', outputs: { result: true } },
      ],
    };
    const compiled = compiledOf(graph);
    const events = await collect(
      runFlow(compiled, {
        ...opts,
        checkpoint,
        handlers: { llm: llmOf(llm), condition: { type: 'condition', run: async () => ({ result: true }) } },
      }),
    );

    const started = events
      .filter((x) => x.type === 'node_started')
      .map((x) => (x as { nodeId: string }).nodeId);
    expect(started).toContain('T');
    expect(started).not.toContain('F');
    expect(events.find((x) => x.type === 'run_succeeded')).toMatchObject({ output: 'T' });
  });

  it('checkpoint 已含成功 end 时直接收敛', async () => {
    const checkpoint: FlowCheckpoint = {
      runId: 'r1',
      lastSucceededNodeId: 'end',
      nodes: [
        { nodeId: 'start', status: 'succeeded', outputs: {} },
        { nodeId: 'A', status: 'succeeded', outputs: { text: 'A' } },
        { nodeId: 'end', status: 'succeeded', outputs: { output: 'A' } },
      ],
    };
    const events = await collect(
      runFlow(compiledOf(chain()), { ...opts, checkpoint, handlers: { llm: llmOf(async () => ({ text: 'X' })) } }),
    );
    expect(events.map((x) => x.type)).toEqual(['run_started', 'run_succeeded']);
    expect(events[1]).toMatchObject({ output: 'A' });
  });
});

describe('v4.23 重试与超时', () => {
  it('可重试错误按退避重试，事件带 attempt', async () => {
    const attempts: number[] = [];
    const handler = vi.fn(async () => {
      attempts.push(attempts.length + 1);
      if (attempts.length < 3) throw new Error(`第 ${attempts.length} 次失败`);
      return { text: 'A' };
    });
    const graph = chain();
    graph.nodes[1]!.config = {
      tag: 'A',
      retry: { maxAttempts: 3, backoffMs: 100, maxBackoffMs: 1_000 },
    };
    const events = await collect(
      runFlow(compiledOf(graph), { ...opts, handlers: { llm: llmOf(handler) } }),
    );

    const starts = events.filter(
      (x) => x.type === 'node_started' && (x as { nodeId: string }).nodeId === 'A',
    );
    expect(starts).toHaveLength(3);
    expect(starts.map((x) => (x as { attempt?: number }).attempt)).toEqual([undefined, 2, 3]);
    expect(handler).toHaveBeenCalledTimes(3);
    expect(events.find((x) => x.type === 'run_succeeded')).toMatchObject({ output: 'A' });
  });

  it('耗尽次数后 node_failed 带最终 attempt 并终止运行', async () => {
    const handler = vi.fn(async () => {
      throw new Error('持续失败');
    });
    const graph = chain();
    graph.nodes[1]!.config = { retry: { maxAttempts: 2, backoffMs: 100 } };
    const events = await collect(
      runFlow(compiledOf(graph), { ...opts, handlers: { llm: llmOf(handler) } }),
    );

    expect(handler).toHaveBeenCalledTimes(2);
    expect(events.find((x) => x.type === 'node_failed')).toMatchObject({
      nodeId: 'A',
      message: '持续失败',
      attempt: 2,
    });
    expect(events.at(-1)?.type).toBe('run_failed');
  });

  it('不可重试错误只执行一次', async () => {
    const graph: FlowGraph = {
      nodes: [
        n('start', 'start'),
        n('T', 'tool', { toolName: 'missing', retry: { maxAttempts: 3, backoffMs: 100 } }),
        n('end', 'end', { output: 'x' }),
      ],
      edges: [e('e1', 'start', 'T'), e('e2', 'T', 'end')],
    };
    const resolveTool = vi.fn(() => null);
    const events = await collect(
      runFlow(compiledOf(graph), {
        ...opts,
        context: { resolveTool, executeTool: async () => ({ ok: true, output: '', summary: '' }) },
      }),
    );
    expect(resolveTool).toHaveBeenCalledTimes(1);
    expect(events.find((x) => x.type === 'node_failed')).toMatchObject({
      nodeId: 'T',
      message: '工具不存在或当前不可用：missing',
    });
    expect((events.find((x) => x.type === 'node_failed') as { attempt?: number }).attempt).toBeUndefined();
  });

  it('非交互节点超时按失败收敛', async () => {
    const handler = vi.fn(async () => {
      await sleep(1_200);
      return { text: 'late' };
    });
    const graph = chain();
    graph.nodes[1]!.config = { timeoutMs: 1_000 };
    const events = await collect(
      runFlow(compiledOf(graph), { ...opts, handlers: { llm: llmOf(handler) } }),
    );
    const failed = events.find((x) => x.type === 'node_failed') as { message: string };
    expect(failed.message).toContain('超时');
    expect(events.at(-1)?.type).toBe('run_failed');
  }, 10_000);
});
