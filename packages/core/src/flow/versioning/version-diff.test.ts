import { describe, expect, it } from 'vitest';
import type { FlowEdge, FlowGraph, FlowNode } from '@wbfm/shared/schemas';
import { diffFlowGraphs } from './version-diff';

function node(id: string, type: FlowNode['type'], config: Record<string, unknown> = {}): FlowNode {
  return { id, type, position: { x: 0, y: 0 }, config };
}

function edge(source: string, target: string, sourceHandle?: 'true' | 'false'): FlowEdge {
  return { id: `${source}-${target}-${sourceHandle ?? ''}`, source, target, sourceHandle };
}

function graph(nodes: FlowNode[], edges: FlowEdge[]): FlowGraph {
  return { nodes, edges };
}

describe('diffFlowGraphs（v2.15 M4）', () => {
  it('节点新增 / 删除，并按 id 升序输出', () => {
    const before = graph([node('a', 'start'), node('b', 'end')], [edge('a', 'b')]);
    const after = graph([node('b', 'end'), node('c', 'llm')], [edge('b', 'c')]);

    const diff = diffFlowGraphs(1, 2, before, after);
    expect(diff.nodes.added).toEqual([{ id: 'c', type: 'llm' }]);
    expect(diff.nodes.removed).toEqual([{ id: 'a', type: 'start' }]);
    expect(diff.summary.nodesAdded).toBe(1);
    expect(diff.summary.nodesRemoved).toBe(1);
    expect(diff.summary.nodesTypeChanged).toBe(0);
    expect(diff.summary.nodesConfigChanged).toBe(0);
  });

  it('节点 type 变化只报 typeChanged，不再报 configChanged', () => {
    const before = graph([node('a', 'llm', { modelId: 'm1' })], []);
    const after = graph([node('a', 'tool', { toolName: 'read' })], []);

    const diff = diffFlowGraphs(1, 2, before, after);
    expect(diff.nodes.typeChanged).toEqual([{ id: 'a', fromType: 'llm', toType: 'tool' }]);
    expect(diff.nodes.configChanged).toEqual([]);
    expect(diff.summary.nodesTypeChanged).toBe(1);
    expect(diff.summary.nodesConfigChanged).toBe(0);
  });

  it('config 只比顶层键：嵌套对象变化命中，坐标变化忽略', () => {
    const before = graph(
      [
        {
          id: 'a',
          type: 'llm',
          position: { x: 0, y: 0 },
          config: { modelId: 'm1', nested: { k: 1 }, prompt: 'x' },
        },
      ],
      [],
    );
    const after = graph(
      [
        {
          id: 'a',
          type: 'llm',
          position: { x: 120, y: 40 },
          config: { modelId: 'm2', nested: { k: 2 }, prompt: 'x' },
        },
      ],
      [],
    );

    const diff = diffFlowGraphs(1, 2, before, after);
    expect(diff.nodes.configChanged).toEqual([
      { id: 'a', type: 'llm', keys: ['modelId', 'nested'] },
    ]);
    expect(diff.summary.nodesConfigChanged).toBe(1);
    expect(diff.nodes.added).toEqual([]);
    expect(diff.nodes.removed).toEqual([]);
  });

  it('新增 / 删除 config 键也标记为变化', () => {
    const before = graph([node('a', 'llm', { modelId: 'm1' })], []);
    const after = graph([node('a', 'llm', { modelId: 'm1', temperature: 0.5 })], []);

    const diff = diffFlowGraphs(1, 2, before, after);
    expect(diff.nodes.configChanged[0]?.keys).toEqual(['temperature']);
  });

  it('边按 source→target→handle 身份比较，忽略 edge id', () => {
    const before = graph(
      [node('a', 'start'), node('b', 'condition'), node('c', 'end'), node('d', 'llm')],
      [
        { id: 'old-1', source: 'a', target: 'b' },
        { id: 'old-2', source: 'b', target: 'c', sourceHandle: 'true' },
      ],
    );
    const after = graph(
      [node('a', 'start'), node('b', 'condition'), node('c', 'end'), node('d', 'llm')],
      [
        { id: 'new-1', source: 'a', target: 'b' },
        { id: 'new-2', source: 'b', target: 'd', sourceHandle: 'false' },
      ],
    );

    const diff = diffFlowGraphs(1, 2, before, after);
    expect(diff.edges.added).toEqual([{ source: 'b', target: 'd', handle: 'false' }]);
    expect(diff.edges.removed).toEqual([{ source: 'b', target: 'c', handle: 'true' }]);
    expect(diff.summary.edgesAdded).toBe(1);
    expect(diff.summary.edgesRemoved).toBe(1);
  });

  it('句柄变化视为旧边删除 + 新边新增', () => {
    const before = graph(
      [node('a', 'condition'), node('b', 'end')],
      [{ id: 'e1', source: 'a', target: 'b', sourceHandle: 'true' }],
    );
    const after = graph(
      [node('a', 'condition'), node('b', 'end')],
      [{ id: 'e1', source: 'a', target: 'b', sourceHandle: 'false' }],
    );

    const diff = diffFlowGraphs(1, 2, before, after);
    expect(diff.edges.added).toEqual([{ source: 'a', target: 'b', handle: 'false' }]);
    expect(diff.edges.removed).toEqual([{ source: 'a', target: 'b', handle: 'true' }]);
  });

  it('完全相同的图：所有分组为空，summary 全零', () => {
    const before = graph([node('a', 'start'), node('b', 'end')], [edge('a', 'b')]);
    const after = graph([node('a', 'start'), node('b', 'end')], [edge('a', 'b')]);

    const diff = diffFlowGraphs(1, 1, before, after);
    expect(diff.nodes).toEqual({ added: [], removed: [], typeChanged: [], configChanged: [] });
    expect(diff.edges).toEqual({ added: [], removed: [] });
    expect(diff.summary).toEqual({
      nodesAdded: 0,
      nodesRemoved: 0,
      nodesTypeChanged: 0,
      nodesConfigChanged: 0,
      edgesAdded: 0,
      edgesRemoved: 0,
    });
  });
});
