import {
  canonicalJson,
  type FlowEdge,
  type FlowGraph,
  type FlowGraphDiff,
  type FlowNode,
} from '@wbfm/shared/schemas';

/** v2.15 M4：工作流版本差异纯函数（节点 id / 边端点 + handle / config 顶层键） */

function nodeMap(graph: FlowGraph): Map<string, FlowNode> {
  return new Map(graph.nodes.map((node) => [node.id, node]));
}

function edgeKey(edge: FlowEdge): string {
  return `${edge.source}\u0000${edge.target}\u0000${edge.sourceHandle ?? ''}`;
}

function edgeView(edge: FlowEdge): { source: string; target: string; handle: string | null } {
  return { source: edge.source, target: edge.target, handle: edge.sourceHandle ?? null };
}

function edgeViewKey(edge: { source: string; target: string; handle: string | null }): string {
  return `${edge.source}\u0000${edge.target}\u0000${edge.handle ?? ''}`;
}

function changedConfigKeys(before: FlowNode, after: FlowNode): string[] {
  const keys = new Set([...Object.keys(before.config), ...Object.keys(after.config)]);
  const changed: string[] = [];
  for (const key of keys) {
    const inBefore = Object.prototype.hasOwnProperty.call(before.config, key);
    const inAfter = Object.prototype.hasOwnProperty.call(after.config, key);
    if (
      !inBefore ||
      !inAfter ||
      canonicalJson(before.config[key]) !== canonicalJson(after.config[key])
    ) {
      changed.push(key);
    }
  }
  return changed.sort();
}

export function diffFlowGraphs(
  from: number,
  to: number,
  before: FlowGraph,
  after: FlowGraph,
): FlowGraphDiff {
  const beforeNodes = nodeMap(before);
  const afterNodes = nodeMap(after);
  const addedNodes = [...afterNodes.values()]
    .filter((node) => !beforeNodes.has(node.id))
    .map((node) => ({ id: node.id, type: node.type }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const removedNodes = [...beforeNodes.values()]
    .filter((node) => !afterNodes.has(node.id))
    .map((node) => ({ id: node.id, type: node.type }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const typeChanged: FlowGraphDiff['nodes']['typeChanged'] = [];
  const configChanged: FlowGraphDiff['nodes']['configChanged'] = [];
  for (const [id, afterNode] of afterNodes) {
    const beforeNode = beforeNodes.get(id);
    if (!beforeNode) continue;
    if (beforeNode.type !== afterNode.type) {
      typeChanged.push({ id, fromType: beforeNode.type, toType: afterNode.type });
      continue;
    }
    const keys = changedConfigKeys(beforeNode, afterNode);
    if (keys.length > 0) configChanged.push({ id, type: afterNode.type, keys });
  }
  typeChanged.sort((a, b) => a.id.localeCompare(b.id));
  configChanged.sort((a, b) => a.id.localeCompare(b.id));

  const beforeEdges = new Map(before.edges.map((edge) => [edgeKey(edge), edge]));
  const afterEdges = new Map(after.edges.map((edge) => [edgeKey(edge), edge]));
  const addedEdges = [...afterEdges.entries()]
    .filter(([key]) => !beforeEdges.has(key))
    .map(([, edge]) => edgeView(edge))
    .sort((a, b) => edgeViewKey(a).localeCompare(edgeViewKey(b)));
  const removedEdges = [...beforeEdges.entries()]
    .filter(([key]) => !afterEdges.has(key))
    .map(([, edge]) => edgeView(edge))
    .sort((a, b) => edgeViewKey(a).localeCompare(edgeViewKey(b)));

  return {
    from,
    to,
    nodes: { added: addedNodes, removed: removedNodes, typeChanged, configChanged },
    edges: { added: addedEdges, removed: removedEdges },
    summary: {
      nodesAdded: addedNodes.length,
      nodesRemoved: removedNodes.length,
      nodesTypeChanged: typeChanged.length,
      nodesConfigChanged: configChanged.length,
      edgesAdded: addedEdges.length,
      edgesRemoved: removedEdges.length,
    },
  };
}
