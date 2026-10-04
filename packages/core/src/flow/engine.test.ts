import type { FlowEventPayload, FlowGraph, FlowNodeType } from '@wbfm/shared';
import { describe, expect, it } from 'vitest';
import { compileFlow } from './compiler';
import { runFlow } from './engine';
import type { FlowNodeHandler } from './types';

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

const n = (id: string, type: FlowNodeType, config: Record<string, unknown> = {}) => ({
  id,
  type,
  position: { x: 0, y: 0 },
  config,
});
const e = (id: string, source: string, target: string, sourceHandle?: 'true' | 'false') => ({
  id,
  source,
  target,
  sourceHandle,
});

const opts = { workflowId: 'wf1', version: 1, runId: 'run1' };

describe('runFlow：最小图 start→end', () => {
  it('产出完整事件序列，end 输出引用 start 入参（保留原始类型）', async () => {
    const graph: FlowGraph = {
      nodes: [n('start', 'start'), n('end', 'end', { output: '{{$nodes.start.params.topic}}' })],
      edges: [e('e1', 'start', 'end')],
    };
    const events = await collect(
      runFlow(compiledOf(graph), { ...opts, input: { topic: '周报' } }),
    );

    expect(events.map((x) => x.type)).toEqual([
      'run_started',
      'node_started',
      'node_succeeded',
      'node_started',
      'node_succeeded',
      'run_succeeded',
    ]);
    expect(events[0]).toMatchObject({ type: 'run_started', workflowId: 'wf1', version: 1 });
    const succeeded = events.find((x) => x.type === 'run_succeeded');
    expect(succeeded).toMatchObject({ type: 'run_succeeded', output: '周报' });
  });

  it('$ref 整字段绑定把对象透传到 end 输出', async () => {
    const graph: FlowGraph = {
      nodes: [n('start', 'start'), n('end', 'end', { output: { $ref: 'nodes.start.params' } })],
      edges: [e('e1', 'start', 'end')],
    };
    const events = await collect(
      runFlow(compiledOf(graph), { ...opts, input: { a: 1 } }),
    );
    expect(events.at(-1)).toMatchObject({ type: 'run_succeeded', output: { a: 1 } });
  });
});

describe('runFlow：自定义处理器与数据流转', () => {
  it('注入 llm 处理器：start→llm→end，输出沿作用域流动', async () => {
    const llmHandler: FlowNodeHandler<{ suffix?: string }, { text: string }> = {
      type: 'llm',
      async run(config, ctx) {
        return { text: `${String(ctx.input.topic ?? '')}${config.suffix ?? ''}` };
      },
    };
    const graph: FlowGraph = {
      nodes: [
        n('start', 'start'),
        n('llm1', 'llm', { suffix: '!' }),
        n('end', 'end', { output: { $ref: 'nodes.llm1.outputs.text' } }),
      ],
      edges: [e('e1', 'start', 'llm1'), e('e2', 'llm1', 'end')],
    };
    const events = await collect(
      runFlow(compiledOf(graph), { ...opts, input: { topic: '总结' }, handlers: { llm: llmHandler } }),
    );
    expect(events.at(-1)).toMatchObject({ type: 'run_succeeded', output: '总结!' });
    const llmDone = events.find(
      (x) => x.type === 'node_succeeded' && 'nodeId' in x && x.nodeId === 'llm1',
    );
    expect(llmDone).toMatchObject({ outputs: { text: '总结!' } });
  });
});

describe('runFlow：失败路径', () => {
  it('未注册的节点类型：node_failed + run_failed', async () => {
    const graph: FlowGraph = {
      nodes: [n('start', 'start'), n('tool1', 'tool'), n('end', 'end')],
      edges: [e('e1', 'start', 'tool1'), e('e2', 'tool1', 'end')],
    };
    const events = await collect(runFlow(compiledOf(graph), opts));
    expect(events.map((x) => x.type)).toEqual([
      'run_started',
      'node_started',
      'node_succeeded',
      'node_started',
      'node_failed',
      'run_failed',
    ]);
    expect(events.at(-1)).toMatchObject({ type: 'run_failed', nodeId: 'tool1' });
  });

  it('处理器抛错：失败事件带消息且不再继续', async () => {
    const badHandler: FlowNodeHandler = {
      type: 'tool',
      async run() {
        throw new Error('boom');
      },
    };
    const graph: FlowGraph = {
      nodes: [n('start', 'start'), n('tool1', 'tool'), n('end', 'end')],
      edges: [e('e1', 'start', 'tool1'), e('e2', 'tool1', 'end')],
    };
    const events = await collect(runFlow(compiledOf(graph), { ...opts, handlers: { tool: badHandler } }));
    expect(events.at(-2)).toMatchObject({ type: 'node_failed', nodeId: 'tool1', message: 'boom' });
    expect(events.at(-1)).toMatchObject({ type: 'run_failed', message: 'boom' });
  });

  it('end 引用无法解析：node_failed 定位到 end', async () => {
    const graph: FlowGraph = {
      nodes: [n('start', 'start'), n('end', 'end', { output: '{{$nodes.ghost.outputs.x}}' })],
      edges: [e('e1', 'start', 'end')],
    };
    const events = await collect(runFlow(compiledOf(graph), opts));
    expect(events.at(-1)).toMatchObject({ type: 'run_failed', nodeId: 'end' });
  });
});

describe('runFlow：取消', () => {
  it('运行前 abort：run_started 后立即 run_cancelled', async () => {
    const graph: FlowGraph = {
      nodes: [n('start', 'start'), n('end', 'end')],
      edges: [e('e1', 'start', 'end')],
    };
    const controller = new AbortController();
    controller.abort();
    const events = await collect(
      runFlow(compiledOf(graph), { ...opts, signal: controller.signal }),
    );
    expect(events.map((x) => x.type)).toEqual(['run_started', 'run_cancelled']);
  });
});
