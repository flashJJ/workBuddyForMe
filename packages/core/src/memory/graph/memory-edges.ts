import type { Memory } from '@wbfm/shared/types';
import { MEMORY_EDGE_SAME_SOURCE_WEIGHT } from '@wbfm/shared/constants';
import type { MemoryEdgeInput } from '@wbfm/database';

/**
 * v2.31 P0 关系边构建（纯函数）：
 * - 只有同一条助手消息里写入的多条记忆之间建 same_source 边；
 * - 约束与置顶记忆不参与建边（它们每轮固定注入，不需要邻居扩展）；
 * - 无向边按 id 数值升序规范化，保证同一对记忆只落一条；
 * - co_turn 预留在仓储枚举中，等出现跨消息同回合写入时再启用。
 */
export function buildSameSourceEdges(
  memories: Memory[],
  sourceMessageId: string | null,
): MemoryEdgeInput[] {
  if (!sourceMessageId) return [];
  const eligible = memories.filter(
    (memory) => memory.status === 'active' && !memory.pinned && memory.kind !== 'constraint',
  );
  const edges: MemoryEdgeInput[] = [];
  for (let i = 0; i < eligible.length; i += 1) {
    for (let j = i + 1; j < eligible.length; j += 1) {
      const [fromId, toId] = orderedPair(eligible[i]!.id, eligible[j]!.id);
      if (fromId === toId) continue;
      edges.push({ fromId, toId, relation: 'same_source', weight: MEMORY_EDGE_SAME_SOURCE_WEIGHT });
    }
  }
  return edges;
}

function orderedPair(a: string, b: string): [string, string] {
  return Number(a) <= Number(b) ? [a, b] : [b, a];
}
