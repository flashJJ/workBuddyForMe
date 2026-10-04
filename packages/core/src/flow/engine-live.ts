import type { CompiledFlow, FlowNodeState } from './types';

/**
 * 入边索引：nodeId → 指向它的全部边（含来源节点）。
 * 由编译器的 successors 反推，供引擎逐节点做活性判断。
 */
export interface IncomingEdge {
  edgeId: string;
  source: string;
}

export function buildIncomingIndex(compiled: CompiledFlow): Map<string, IncomingEdge[]> {
  const incoming = new Map<string, IncomingEdge[]>();
  for (const node of compiled.graph.nodes) incoming.set(node.id, []);
  for (const node of compiled.graph.nodes) {
    for (const succ of compiled.successors.get(node.id) ?? []) {
      incoming.get(succ.node)?.push({ edgeId: succ.edgeId, source: node.id });
    }
  }
  return incoming;
}

/**
 * 节点活性：该节点是否应在本次运行中执行。
 * - start 恒活；
 * - 其余节点需要至少一条入边满足「前驱成功」且「边导通」：
 *   普通前驱的出边天然导通；condition 前驱只有命中分支边导通。
 */
export function isNodeLive(
  nodeId: string,
  startNodeId: string,
  incoming: Map<string, IncomingEdge[]>,
  state: Map<string, FlowNodeState>,
  liveEdges: Set<string>,
  compiled: CompiledFlow,
): boolean {
  if (nodeId === startNodeId) return true;
  return (incoming.get(nodeId) ?? []).some((edge) => {
    if (state.get(edge.source) !== 'succeeded') return false;
    const sourceNode = compiled.nodesById.get(edge.source);
    return sourceNode?.type !== 'condition' || liveEdges.has(edge.edgeId);
  });
}
