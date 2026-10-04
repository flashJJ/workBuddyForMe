import type {
  FlowEventPayload,
  FlowGraph,
  FlowNodeType,
  PermissionLevel,
} from '@wbfm/shared';
import { describe, expect, it } from 'vitest';
import { compileFlow } from './compiler';
import { runFlow } from './engine';
import type { FlowExecutionContext, FlowNodeHandler } from './types';
import type { Tool } from '../tools/types';

async function collect(gen: AsyncGenerator<FlowEventPayload>): Promise<FlowEventPayload[]> {
  const events: FlowEventPayload[] = [];
  for await (const event of gen) events.push(event);
  return events;
}

const n = (
  id: string,
  type: FlowNodeType,
  config: Record<string, unknown> = {},
  x = 0,
  y = 0,
) => ({ id, type, position: { x, y }, config });
const e = (id: string, source: string, target: string, sourceHandle?: 'true' | 'false') => ({
  id,
  source,
  target,
  sourceHandle,
});
const compiledOf = (graph: FlowGraph) => {
  const result = compileFlow(graph);
  if (!result.compiled) throw new Error(result.diagnostics.map((d) => d.message).join('；'));
  return result.compiled;
};
const types = (events: FlowEventPayload[]) => events.map((x) => x.type);

/** start→cond→(true/false)→两个 end，condition 规则用字面量确定性求值 */
function branchGraph(result: boolean): FlowGraph {
  return {
    nodes: [
      n('start', 'start'),
      n('cond', 'condition', { rules: [{ left: result, op: '==', right: true }] }),
      n('endTrue', 'end', { output: 'YES' }, 300, -100),
      n('endFalse', 'end', { output: 'NO' }, 300, 100),
    ],
    edges: [
      e('e0', 'start', 'cond'),
      e('e1', 'cond', 'endTrue', 'true'),
      e('e2', 'cond', 'endFalse', 'false'),
    ],
  };
}

describe('runFlow：条件分支剪枝', () => {
  it('条件为 true：true 分支执行，false 分支节点 skipped，输出命中 end 的结果', async () => {
    const events = await collect(runFlow(compiledOf(branchGraph(true)), { workflowId: 'w', version: 1 }));
    expect(types(events)).toEqual([
      'run_started',
      'node_started',
      'node_succeeded',
      'node_started',
      'node_succeeded',
      'node_started',
      'node_succeeded',
      'node_skipped',
      'run_succeeded',
    ]);
    const skipped = events.find((x) => x.type === 'node_skipped');
    expect(skipped).toMatchObject({ nodeId: 'endFalse' });
    expect(events.find((x) => x.type === 'run_succeeded')).toMatchObject({ output: 'YES' });
  });

  it('条件为 false：对称剪枝', async () => {
    const events = await collect(runFlow(compiledOf(branchGraph(false)), { workflowId: 'w', version: 1 }));
    expect(events.find((x) => x.type === 'node_skipped')).toMatchObject({ nodeId: 'endTrue' });
    expect(events.at(-1)).toMatchObject({ type: 'run_succeeded' });
    expect(events.find((x) => x.type === 'run_succeeded')).toMatchObject({ output: 'NO' });
  });

  it('未命中分支上的整条链（含 llm 节点）都被 skipped', async () => {
    const graph: FlowGraph = {
      nodes: [
        n('start', 'start'),
        n('cond', 'condition', { rules: [{ left: true, op: 'isEmpty' }] }), // isEmpty(true)=false
        n('genTrue', 'llm', { user: 'hi' }, 300, -100),
        n('endTrue', 'end', { output: 'T' }, 500, -100),
        n('genFalse', 'llm', { user: 'bye' }, 300, 100),
        n('endFalse', 'end', { output: 'F' }, 500, 100),
      ],
      edges: [
        e('e0', 'start', 'cond'),
        e('e1', 'cond', 'genTrue', 'true'),
        e('e2', 'genTrue', 'endTrue'),
        e('e3', 'cond', 'genFalse', 'false'),
        e('e4', 'genFalse', 'endFalse'),
      ],
    };
    // 只给 true 分支注入处理器；false 分支若被误执行会因无模型能力而失败
    const llmHandler: FlowNodeHandler = {
      type: 'llm',
      async run(config) {
        return { text: config.user === 'hi' ? 'T' : 'F' };
      },
    };
    const events = await collect(
      runFlow(compiledOf(graph), {
        workflowId: 'w',
        version: 1,
        handlers: { llm: llmHandler },
        context: {
          // true 分支处理器不依赖回调；这里提供空能力，证明 false 分支不会被执行
          resolveChatTarget: undefined,
        },
      }),
    );
    const skipped = events.filter((x) => x.type === 'node_skipped').map((x) => 'nodeId' in x && x.nodeId);
    expect(skipped).toEqual(['genTrue', 'endTrue']);
    expect(events.find((x) => x.type === 'run_succeeded')).toMatchObject({ output: 'F' });
  });
});

describe('runFlow：human 人工节点', () => {
  const humanGraph: FlowGraph = {
    nodes: [
      n('start', 'start'),
      n('review', 'human'),
      n('cond', 'condition', { rules: [{ left: '{{$nodes.review.outputs.approved}}', op: '==', right: true }] }),
      n('endApprove', 'end', { output: 'approved' }, 400, -100),
      n('endReject', 'end', { output: 'rejected' }, 400, 100),
    ],
    edges: [
      e('e0', 'start', 'review'),
      e('e1', 'review', 'cond'),
      e('e2', 'cond', 'endApprove', 'true'),
      e('e3', 'cond', 'endReject', 'false'),
    ],
  };

  it('交互式：先 waiting_human，提交 approved:true 后沿 true 分支结束', async () => {
    const events = await collect(
      runFlow(compiledOf(humanGraph), {
        workflowId: 'w',
        version: 1,
        interactive: true,
        context: {
          requestHuman: async () => ({ approved: true, values: { note: 'ok' } }),
        },
      }),
    );
    expect(types(events)).toContain('node_waiting_human');
    expect(events.find((x) => x.type === 'node_waiting_human')).toMatchObject({ nodeId: 'review' });
    expect(events.find((x) => x.type === 'run_succeeded')).toMatchObject({ output: 'approved' });
    expect(events.find((x) => x.type === 'node_skipped')).toMatchObject({ nodeId: 'endReject' });
  });

  it('非交互（对话触发）：自动 approved:false，走驳回分支', async () => {
    const events = await collect(
      runFlow(compiledOf(humanGraph), { workflowId: 'w', version: 1, interactive: false }),
    );
    expect(types(events)).toContain('node_waiting_human');
    expect(events.find((x) => x.type === 'run_succeeded')).toMatchObject({ output: 'rejected' });
  });
});

describe('runFlow：tool 节点门控', () => {
  const fakeTool = (permission: PermissionLevel): Tool => ({
    name: 'some_tool',
    description: 't',
    parameters: { type: 'object' },
    permission,
    async run() {
      return { ok: true, output: 'TOOL-OK', summary: 'ran' };
    },
  });

  function toolGraph(): FlowGraph {
    return {
      nodes: [
        n('start', 'start'),
        n('t1', 'tool', { toolName: 'some_tool', args: { x: 1 } }),
        n('end', 'end', { output: { $ref: 'nodes.t1.outputs.output' } }),
      ],
      edges: [e('e1', 'start', 't1'), e('e2', 't1', 'end')],
    };
  }

  function ctxOverrides(overrides: Partial<FlowExecutionContext>): Partial<FlowExecutionContext> {
    return overrides;
  }

  it('read 工具直接执行，输出经 $ref 流向 end', async () => {
    const events = await collect(
      runFlow(compiledOf(toolGraph()), {
        workflowId: 'w',
        version: 1,
        context: ctxOverrides({
          resolveTool: async () => fakeTool('read'),
          executeTool: async (tool, args) => tool.run(args, { knowledgeBaseId: '', retrieve: async () => [] }),
        }),
      }),
    );
    expect(types(events)).not.toContain('node_waiting_human');
    expect(events.find((x) => x.type === 'run_succeeded')).toMatchObject({ output: 'TOOL-OK' });
  });

  it('danger 工具已有授权（checkToolAllowed=true）：不挂起直接执行', async () => {
    const events = await collect(
      runFlow(compiledOf(toolGraph()), {
        workflowId: 'w',
        version: 1,
        context: ctxOverrides({
          resolveTool: async () => fakeTool('danger'),
          checkToolAllowed: () => true,
          executeTool: async (tool, args) => tool.run(args, { knowledgeBaseId: '', retrieve: async () => [] }),
        }),
      }),
    );
    expect(types(events)).not.toContain('node_waiting_human');
    expect(events.find((x) => x.type === 'run_succeeded')).toMatchObject({ output: 'TOOL-OK' });
  });

  it('danger 工具未授权：waiting_human → 确认允许后执行', async () => {
    const events = await collect(
      runFlow(compiledOf(toolGraph()), {
        workflowId: 'w',
        version: 1,
        context: ctxOverrides({
          resolveTool: async () => fakeTool('danger'),
          checkToolAllowed: () => false,
          requestToolConfirmation: async () => true,
          executeTool: async (tool, args) => tool.run(args, { knowledgeBaseId: '', retrieve: async () => [] }),
        }),
      }),
    );
    expect(types(events)).toContain('node_waiting_human');
    expect(events.find((x) => x.type === 'run_succeeded')).toMatchObject({ output: 'TOOL-OK' });
  });

  it('danger 工具确认被拒：节点产出 ok:false（非交互环境同样拒绝），流程继续到 end', async () => {
    const events = await collect(
      runFlow(compiledOf(toolGraph()), {
        workflowId: 'w',
        version: 1,
        interactive: false,
        context: ctxOverrides({
          resolveTool: async () => fakeTool('danger'),
          checkToolAllowed: () => false,
        }),
      }),
    );
    const toolDone = events.find(
      (x) => x.type === 'node_succeeded' && 'nodeId' in x && x.nodeId === 't1',
    );
    expect(toolDone).toMatchObject({ outputs: { ok: false } });
    // $ref 取到拒绝文本
    const final = events.find((x) => x.type === 'run_succeeded');
    expect(String((final as { output?: unknown }).output)).toContain('未获得用户授权');
  });

  it('工具不存在：node_failed + run_failed 定位到工具节点', async () => {
    const events = await collect(
      runFlow(compiledOf(toolGraph()), {
        workflowId: 'w',
        version: 1,
        context: ctxOverrides({ resolveTool: async () => null }),
      }),
    );
    expect(events.at(-1)).toMatchObject({ type: 'run_failed', nodeId: 't1' });
  });
});
