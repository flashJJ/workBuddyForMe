import type { FlowGraph } from '@wbfm/shared';
import { describe, expect, it } from 'vitest';
import { compileFlow } from './compiler';
import { computeReplayClosure } from './replay';

function compile(graph: FlowGraph) {
  const result = compileFlow(graph);
  if (!result.compiled) throw new Error('图编译失败');
  return result.compiled;
}

const graph: FlowGraph = {
  nodes: [
    { id: 'start', type: 'start', position: { x: 0, y: 0 }, config: {} },
    { id: 'fetch', type: 'tool', position: { x: 1, y: 0 }, config: { toolName: 'fetch_webpage' } },
    { id: 'cond', type: 'condition', position: { x: 2, y: 0 }, config: { rules: [], logic: 'and' } },
    { id: 'endTrue', type: 'end', position: { x: 3, y: 0 }, config: { output: 'T' } },
    { id: 'endFalse', type: 'end', position: { x: 3, y: 2 }, config: { output: 'F' } },
  ],
  edges: [
    { id: 'e1', source: 'start', target: 'fetch' },
    { id: 'e2', source: 'fetch', target: 'cond' },
    { id: 'e3', source: 'cond', target: 'endTrue', sourceHandle: 'true' },
    { id: 'e4', source: 'cond', target: 'endFalse', sourceHandle: 'false' },
  ],
};

describe('重放祖先闭包（v0.9 M4）', () => {
  it('从中间节点求闭包：目标 + 全部上游，不含下游分支', () => {
    const compiled = compile(graph);
    const closure = computeReplayClosure(compiled, 'cond');
    expect([...closure].sort()).toEqual(['cond', 'fetch', 'start']);
    expect(closure.has('endTrue')).toBe(false);
    expect(closure.has('endFalse')).toBe(false);
  });

  it('从 end 节点求闭包覆盖完整链路', () => {
    const compiled = compile(graph);
    expect([...computeReplayClosure(compiled, 'endTrue')].sort()).toEqual([
      'cond',
      'endTrue',
      'fetch',
      'start',
    ]);
  });

  it('目标不在图中时回退仅含目标自身', () => {
    const compiled = compile(graph);
    expect([...computeReplayClosure(compiled, 'ghost')]).toEqual(['ghost']);
  });
});
