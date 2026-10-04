import type { FlowEdge, FlowGraph, FlowNode, FlowNodeType } from '@wbfm/shared';
import { describe, expect, it } from 'vitest';
import { compileFlow } from './compiler';

function node(id: string, type: FlowNodeType, pos = [0, 0]): FlowNode {
  return { id, type, position: { x: pos[0]!, y: pos[1]! }, config: {} };
}
function edge(id: string, source: string, target: string, sourceHandle?: 'true' | 'false'): FlowEdge {
  return { id, source, target, sourceHandle };
}
function graph(nodes: FlowNode[], edges: FlowEdge[]): FlowGraph {
  return { nodes, edges };
}
const minimal = () => graph([node('start', 'start'), node('end', 'end')], [edge('e1', 'start', 'end')]);

const codes = (g: FlowGraph) => compileFlow(g).diagnostics.map((d) => d.code.replace(/^flow\//, ''));

describe('compileFlow：合法图', () => {
  it('最小图 start→end 编译通过，拓扑序正确', () => {
    const result = compileFlow(minimal());
    expect(result.ok).toBe(true);
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    expect(result.compiled?.order).toEqual(['start', 'end']);
    expect(result.compiled?.startNodeId).toBe('start');
    expect(result.compiled?.endNodeIds).toEqual(['end']);
  });

  it('condition 双分支到两个 end 合法，warning 为空', () => {
    const g = graph(
      [node('start', 'start'), node('cond', 'condition'), node('endA', 'end'), node('endB', 'end')],
      [
        edge('e1', 'start', 'cond'),
        edge('e2', 'cond', 'endA', 'true'),
        edge('e3', 'cond', 'endB', 'false'),
      ],
    );
    const result = compileFlow(g);
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('condition 未用全部分支只告警不阻断', () => {
    const g = graph(
      [node('start', 'start'), node('cond', 'condition'), node('end', 'end')],
      [edge('e1', 'start', 'cond'), edge('e2', 'cond', 'end', 'true')],
    );
    const result = compileFlow(g);
    expect(result.ok).toBe(true);
    expect(codes(g)).toContain('unused-branch');
  });
});

describe('compileFlow：结构错误', () => {
  it('start 数量不为 1', () => {
    expect(codes(graph([node('end', 'end')], []))).toContain('start-count');
    const twoStart = graph(
      [node('a', 'start'), node('b', 'start'), node('end', 'end')],
      [edge('e1', 'a', 'end')],
    );
    expect(codes(twoStart)).toContain('start-count');
  });

  it('缺少 end', () => {
    expect(codes(graph([node('start', 'start')], []))).toContain('end-count');
  });

  it('节点 id 重复', () => {
    const g = graph(
      [node('x', 'start'), node('x', 'end')],
      [edge('e1', 'x', 'x')],
    );
    expect(codes(g)).toContain('duplicate-node');
  });

  it('边端点不存在', () => {
    const g = graph([node('start', 'start'), node('end', 'end')], [edge('e1', 'start', 'ghost')]);
    expect(codes(g)).toContain('unknown-edge-endpoint');
  });

  it('自环报错', () => {
    const g = graph(
      [node('start', 'start'), node('llm1', 'llm'), node('end', 'end')],
      [edge('e1', 'start', 'llm1'), edge('e2', 'llm1', 'llm1'), edge('e3', 'llm1', 'end')],
    );
    expect(codes(g)).toContain('self-loop');
  });

  it('环（a→b→a）报错并给出路径', () => {
    const g = graph(
      [node('start', 'start'), node('a', 'llm'), node('b', 'llm'), node('end', 'end')],
      [
        edge('e0', 'start', 'a'),
        edge('e1', 'a', 'b'),
        edge('e2', 'b', 'a'),
        edge('e3', 'b', 'end'),
      ],
    );
    const result = compileFlow(g);
    expect(result.ok).toBe(false);
    expect(codes(g)).toContain('cycle');
  });

  it('start 有入边 / end 有出边', () => {
    const badStart = graph(
      [node('start', 'start'), node('llm1', 'llm'), node('end', 'end')],
      [edge('e1', 'llm1', 'start'), edge('e2', 'start', 'end')],
    );
    expect(codes(badStart)).toContain('terminal-edges');

    const badEnd = graph(
      [node('start', 'start'), node('end', 'end'), node('llm1', 'llm')],
      [edge('e1', 'start', 'end'), edge('e2', 'end', 'llm1')],
    );
    expect(codes(badEnd)).toContain('terminal-edges');
  });

  it('普通节点多入边报错（MVP 仅 end 可汇聚）', () => {
    const g = graph(
      [node('start', 'start'), node('a', 'llm'), node('b', 'llm'), node('m', 'llm'), node('end', 'end')],
      [
        edge('e1', 'start', 'a'),
        edge('e2', 'start', 'b'),
        edge('e3', 'a', 'm'),
        edge('e4', 'b', 'm'),
        edge('e5', 'm', 'end'),
      ],
    );
    expect(codes(g)).toContain('multiple-incoming');
  });

  it('不可达节点与死路节点', () => {
    const orphan = graph(
      [node('start', 'start'), node('end', 'end'), node('lonely', 'llm')],
      [edge('e1', 'start', 'end')],
    );
    const cs = codes(orphan);
    expect(cs).toContain('unreachable-node');
    expect(cs).toContain('dead-node');
  });

  it('句柄规则：非 condition 带句柄 / condition 出边无句柄', () => {
    const wrongHandle = graph(
      [node('start', 'start'), node('end', 'end')],
      [edge('e1', 'start', 'end', 'true')],
    );
    expect(codes(wrongHandle)).toContain('invalid-handle');

    const missingHandle = graph(
      [node('start', 'start'), node('cond', 'condition'), node('end', 'end')],
      [edge('e1', 'start', 'cond'), edge('e2', 'cond', 'end')],
    );
    expect(codes(missingHandle)).toContain('invalid-handle');
  });

  it('重复边报错', () => {
    const g = graph(
      [node('start', 'start'), node('cond', 'condition'), node('end', 'end')],
      [
        edge('e1', 'start', 'cond'),
        edge('e2', 'cond', 'end', 'true'),
        edge('e3', 'cond', 'end', 'true'),
      ],
    );
    expect(codes(g)).toContain('duplicate-edge');
  });
});
