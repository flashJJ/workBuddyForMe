import { describe, expect, it } from 'vitest';
import type { FlowGraph } from '@wbfm/shared/schemas';
import type { Tool } from '../../tools/types';
import { runFlow, resolveMaxConcurrency } from './engine';
import { collect, compiledOf, e, n } from './engine-branch.helpers';
import type { FlowNodeHandler } from '../graph/types';
import type { FlowEventPayload } from '@wbfm/shared/types';

const opts = { workflowId: 'w', version: 1, runId: 'r1' };
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 扇出：start → A / B → 两个 end */
function fanOut(parallelism?: number): FlowGraph {
  return {
    nodes: [
      n('start', 'start'),
      n('A', 'llm', { tag: 'A' }),
      n('B', 'llm', { tag: 'B' }),
      n('endA', 'end', { output: '{{$nodes.A.outputs.text}}' }),
      n('endB', 'end', { output: '{{$nodes.B.outputs.text}}' }),
    ],
    edges: [e('e1', 'start', 'A'), e('e2', 'start', 'B'), e('e3', 'A', 'endA'), e('e4', 'B', 'endB')],
    ...(parallelism ? { parallelism } : {}),
  };
}

function succeededIds(events: FlowEventPayload[]): string[] {
  return events
    .filter((x) => x.type === 'node_succeeded')
    .map((x) => (x as { nodeId: string }).nodeId);
}

function makeLlm(overrides: { failOn?: string; delay?: number; onStart?: () => void; onEnd?: () => void } = {}): FlowNodeHandler {
  return {
    type: 'llm',
    async run(config) {
      const tag = String(config.tag ?? '');
      overrides.onStart?.();
      await sleep(overrides.delay ?? 20);
      overrides.onEnd?.();
      if (tag === overrides.failOn) throw new Error(`${tag} 失败`);
      return { text: tag };
    },
  };
}

describe('runFlow 并行调度（v4.22）', () => {
  it('parallelism=2：扇出双分支都执行，并发度 ≤2，输出取拓扑序靠前的 end', async () => {
    let active = 0;
    let peak = 0;
    const calls = new Map<string, number>();
    const handler = makeLlm({
      onStart: () => {
        active += 1;
        peak = Math.max(peak, active);
      },
      onEnd: () => {
        active -= 1;
      },
    });
    const wrapped: FlowNodeHandler = {
      type: 'llm',
      async run(config, ctx) {
        const tag = String(config.tag ?? '');
        calls.set(tag, (calls.get(tag) ?? 0) + 1);
        return handler.run(config, ctx);
      },
    };

    const compiled = compiledOf(fanOut(2));
    const events = await collect(runFlow(compiled, { ...opts, handlers: { llm: wrapped } }));

    expect(events[0]).toMatchObject({ type: 'run_started', parallelism: 2 });
    expect(succeededIds(events)).toEqual(expect.arrayContaining(['A', 'B', 'endA', 'endB']));
    expect(peak).toBe(2);
    expect(calls.get('A')).toBe(1);
    expect(calls.get('B')).toBe(1);
    expect(events.filter((x) => x.type === 'run_succeeded')).toHaveLength(1);
    const expected = compiled.order.indexOf('endA') < compiled.order.indexOf('endB') ? 'A' : 'B';
    expect(events.find((x) => x.type === 'run_succeeded')).toMatchObject({ output: expected });
  });

  it('parallelism=1：保持串行语义，首个 end 收尾，另一分支不执行', async () => {
    let active = 0;
    let peak = 0;
    const handler = makeLlm({
      onStart: () => {
        active += 1;
        peak = Math.max(peak, active);
      },
      onEnd: () => {
        active -= 1;
      },
    });
    const events = await collect(runFlow(compiledOf(fanOut()), { ...opts, handlers: { llm: handler } }));

    expect(events[0]).toMatchObject({ type: 'run_started', parallelism: 1 });
    expect(peak).toBe(1);
    expect(succeededIds(events)).not.toContain('endB');
    expect(events.find((x) => x.type === 'run_succeeded')).toMatchObject({ output: 'A' });
  });

  it('失败隔离：失败分支 end 标 skipped（上游失败），无关分支完成，终态 run_failed', async () => {
    const events = await collect(
      runFlow(compiledOf(fanOut(2)), { ...opts, handlers: { llm: makeLlm({ failOn: 'A', delay: 5 }) } }),
    );

    expect(succeededIds(events)).toEqual(expect.arrayContaining(['B', 'endB']));
    const failed = events.find((x) => x.type === 'node_failed');
    expect(failed).toMatchObject({ nodeId: 'A', message: 'A 失败' });
    const skipA = events.find((x) => x.type === 'node_skipped' && (x as { nodeId: string }).nodeId === 'endA');
    expect(skipA).toMatchObject({ reason: '上游失败' });
    expect(events.at(-1)).toMatchObject({ type: 'run_failed', nodeId: 'A' });
  });

  it('写工具节点独占：不与其他节点并发执行', async () => {
    let llmActive = 0;
    let overlap = false;
    const llm = makeLlm({
      delay: 20,
      onStart: () => {
        llmActive += 1;
      },
      onEnd: () => {
        llmActive -= 1;
      },
    });
    const tool = (permission: Tool['permission']): Tool => ({
      name: 'writer',
      description: 't',
      parameters: { type: 'object' },
      permission,
      async run() {
        return { ok: true, output: 'W', summary: 'w' };
      },
    });
    const graph: FlowGraph = {
      nodes: [
        n('start', 'start'),
        n('A', 'llm', { tag: 'A' }),
        n('W', 'tool', { toolName: 'writer' }),
        n('endA', 'end', { output: '{{$nodes.A.outputs.text}}' }),
        n('endW', 'end', { output: '{{$nodes.W.outputs.output}}' }),
      ],
      edges: [e('e1', 'start', 'A'), e('e2', 'start', 'W'), e('e3', 'A', 'endA'), e('e4', 'W', 'endW')],
      parallelism: 2,
    };

    const events = await collect(
      runFlow(compiledOf(graph), {
        ...opts,
        handlers: { llm },
        context: {
          resolveTool: () => tool('write'),
          checkToolAllowed: () => true,
          executeTool: async () => {
            if (llmActive > 0) overlap = true;
            return { ok: true, output: 'W', summary: 'w' };
          },
        },
      }),
    );

    expect(overlap).toBe(false);
    expect(succeededIds(events)).toEqual(expect.arrayContaining(['A', 'W', 'endA', 'endW']));
  });

  it('resolveMaxConcurrency 按 1–4 钳制且显式覆盖优先', () => {
    const graph = fanOut();
    const plain = compiledOf(graph);
    expect(resolveMaxConcurrency(plain)).toBe(1);
    expect(resolveMaxConcurrency(plain, 0)).toBe(1);
    expect(resolveMaxConcurrency(plain, 9)).toBe(4);
    expect(resolveMaxConcurrency(compiledOf(fanOut(3)))).toBe(3);
    expect(resolveMaxConcurrency(compiledOf(fanOut(3)), 2)).toBe(2);
  });
});
