import { describe, expect, it } from 'vitest';
import type { FlowGraph } from '@wbfm/shared/schemas';
import { fromDomain, toDomain } from './graph-utils';

function graphOf(parallelism?: number): FlowGraph {
  return {
    nodes: [
      { id: 'start', type: 'start', position: { x: 0, y: 0 }, config: {} },
      { id: 'end', type: 'end', position: { x: 120, y: 0 }, config: {} },
    ],
    edges: [{ id: 'e1', source: 'start', target: 'end' }],
    ...(parallelism === undefined ? {} : { parallelism }),
  };
}

describe('v4.24 修复：画布↔领域图保留 parallelism', () => {
  it('fromDomain 读取图上的并行度，缺省归一为 1', () => {
    expect(fromDomain(graphOf(3)).parallelism).toBe(3);
    expect(fromDomain(graphOf()).parallelism).toBe(1);
  });

  it('保存链路：载入再保存后并行度不丢失', () => {
    const canvas = fromDomain(graphOf(3));
    const domain = toDomain(canvas.nodes, canvas.edges, undefined, canvas.parallelism);
    expect(domain.parallelism).toBe(3);
  });

  it('parallelism<=1 或缺省时不写键，旧图保存后字节不变', () => {
    const canvas = fromDomain(graphOf());
    expect('parallelism' in toDomain(canvas.nodes, canvas.edges, undefined, canvas.parallelism)).toBe(false);
    expect('parallelism' in toDomain(canvas.nodes, canvas.edges)).toBe(false);
    expect('parallelism' in toDomain(canvas.nodes, canvas.edges, undefined, 1)).toBe(false);
  });
});
