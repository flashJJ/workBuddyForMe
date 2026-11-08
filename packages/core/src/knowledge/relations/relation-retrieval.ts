/**
 * v2.19 M5：实体关系多跳扩展（纯函数 + 注入读取器）。
 *
 * 从查询命中的实体出发做 BFS：第 1 跳直接关系，第 2 跳引入中间实体；
 * 边去重、实体去重、总边数封顶，避免图噪声把上下文撑爆。
 */

import type { RelationRecord } from '@wbfm/database';

export interface MultiHopRelation extends RelationRecord {
  /** 从起点实体出发的跳数（1 起） */
  hop: number;
}

export interface MultiHopOptions {
  maxHops?: number;
  maxEdges?: number;
}

export const DEFAULT_RELATION_MAX_HOPS = 2;
export const DEFAULT_RELATION_MAX_EDGES = 12;

/** v2.29 P2：设置值统一收窄到 1–3 跳 / 4–24 边，非法值回落默认 */
export function clampRelationCaps(options: MultiHopOptions = {}): Required<MultiHopOptions> {
  const toInt = (value: number | undefined, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback;
  return {
    maxHops: Math.min(3, Math.max(1, toInt(options.maxHops, DEFAULT_RELATION_MAX_HOPS))),
    maxEdges: Math.min(24, Math.max(4, toInt(options.maxEdges, DEFAULT_RELATION_MAX_EDGES))),
  };
}

/**
 * 多跳收集关系边（同步，SQLite 仓储直接读取）；fetchRelations 接收当前层实体 id。
 * 无来源文档的边仍参与遍历，但由上层选择器过滤，不进入引用上下文。
 */
export function collectMultiHopRelations(
  startEntityIds: readonly string[],
  fetchRelations: (entityIds: string[]) => RelationRecord[],
  options: MultiHopOptions = {},
): MultiHopRelation[] {
  const maxHops = Math.max(1, options.maxHops ?? DEFAULT_RELATION_MAX_HOPS);
  const maxEdges = Math.max(1, options.maxEdges ?? DEFAULT_RELATION_MAX_EDGES);
  const seenEntities = new Set(startEntityIds.filter(Boolean));
  const seenEdges = new Set<string>();
  const relations: MultiHopRelation[] = [];
  let frontier = [...seenEntities];

  for (let hop = 1; hop <= maxHops && frontier.length > 0; hop += 1) {
    const edges = fetchRelations(frontier);
    const next = new Set<string>();
    for (const edge of edges) {
      if (seenEdges.has(edge.id)) continue;
      seenEdges.add(edge.id);
      relations.push({ ...edge, hop });
      for (const endpoint of [edge.fromEntityId, edge.toEntityId]) {
        if (!seenEntities.has(endpoint)) {
          seenEntities.add(endpoint);
          next.add(endpoint);
        }
      }
      if (relations.length >= maxEdges) return relations;
    }
    frontier = [...next];
  }
  return relations;
}
