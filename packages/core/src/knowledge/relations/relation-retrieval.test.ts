import { describe, expect, it } from 'vitest';
import type { RelationRecord } from '@wbfm/database';
import { collectMultiHopRelations } from './relation-retrieval';

function edge(
  id: string,
  from: string,
  to: string,
  confidence = 0.7,
): RelationRecord {
  return {
    id,
    fromEntityId: from,
    fromEntityName: from,
    toEntityId: to,
    toEntityName: to,
    relation: '关联',
    description: `${from} 与 ${to} 的原句。`,
    sourceDocumentId: 'd1',
    sourceDocumentName: 'd1.txt',
    sourceChunkId: 1,
    pageNo: 1,
    paragraphNo: 1,
    confidence,
  };
}

describe('collectMultiHopRelations（v2.19 M5）', () => {
  it('两跳扩展：第一层直接边，第二层通过中间实体展开', () => {
    const graph = new Map<string, RelationRecord[]>([
      ['A', [edge('ab', 'A', 'B')]],
      ['B', [edge('bc', 'B', 'C')]],
      ['C', [edge('cd', 'C', 'D')]],
    ]);
    const rows = collectMultiHopRelations(['A'], (ids) =>
      ids.flatMap((id) => graph.get(id) ?? []),
    );
    expect(rows.map((row) => [row.id, row.hop])).toEqual([
      ['ab', 1],
      ['bc', 2],
    ]);
  });

  it('直接边优先于二跳边（同层按仓储顺序）', () => {
    const graph = new Map<string, RelationRecord[]>([
      ['A', [edge('ax', 'A', 'X', 0.9), edge('ab', 'A', 'B', 0.6)]],
      ['B', [edge('bc', 'B', 'C')]],
    ]);
    const rows = collectMultiHopRelations(['A', 'B'], (ids) =>
      ids.flatMap((id) => graph.get(id) ?? []),
    );
    expect(rows.map((row) => row.id)).toEqual(['ax', 'ab', 'bc']);
  });

  it('边去重、实体去重，maxEdges 截断', () => {
    const graph = new Map<string, RelationRecord[]>([
      ['A', [edge('ab', 'A', 'B'), edge('ab', 'A', 'B')]],
      ['B', [edge('bc', 'B', 'C')]],
    ]);
    const rows = collectMultiHopRelations(
      ['A', 'B'],
      (ids) => ids.flatMap((id) => graph.get(id) ?? []),
      { maxEdges: 2 },
    );
    expect(rows.map((row) => row.id)).toEqual(['ab', 'bc']);
  });

  it('空起点与单跳上限安全退化', () => {
    expect(collectMultiHopRelations([], () => [])).toEqual([]);
    const graph = new Map<string, RelationRecord[]>([['A', [edge('ab', 'A', 'B')]]]);
    expect(
      collectMultiHopRelations(['A'], (ids) => ids.flatMap((id) => graph.get(id) ?? []), {
        maxHops: 1,
      }).map((row) => row.id),
    ).toEqual(['ab']);
  });
});
