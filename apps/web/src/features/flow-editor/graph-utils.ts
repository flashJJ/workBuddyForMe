import type { Edge, Node } from '@xyflow/react';
import type {
  FlowEdge,
  FlowGraph,
  FlowNode,
  FlowNodeType,
} from '@wbfm/shared';

/** 画布节点 data：业务配置在 config；运行状态由 FlowStatusContext 注入 */
export type FlowNodeData = {
  config: Record<string, unknown>;
};

export type FlowCanvasNode = Node<FlowNodeData, FlowNodeType>;
export type FlowCanvasEdge = Edge;

export const BRANCH_EDGE_TYPE = 'branch';

let seq = 0;
function nextSeq(): number {
  seq += 1;
  return seq;
}

/** 节点 id 符合 FLOW_NODE_ID_PATTERN：字母开头，仅字母数字_- */
export function genNodeId(type: FlowNodeType): string {
  return `${type}_${Date.now().toString(36)}${nextSeq().toString(36)}`;
}

export function genEdgeId(source: string, target: string): string {
  return `e_${source}__${target}_${nextSeq().toString(36)}`;
}

/** 各类型节点的初始 config（与 core handlers 字段对齐） */
export function defaultConfig(type: FlowNodeType): Record<string, unknown> {
  switch (type) {
    case 'start':
      return { inputs: [] };
    case 'llm':
      return { modelId: '', system: '', user: '' };
    case 'knowledgeSearch':
      return { knowledgeBaseId: '', query: '', topK: 4 };
    case 'tool':
      return { toolName: '', args: {} };
    case 'condition':
      return { rules: [{ left: '', op: '==', right: '' }], match: 'all' };
    case 'human':
      return { prompt: '' };
    case 'end':
      return { output: '' };
  }
}

export function createNode(type: FlowNodeType, position: { x: number; y: number }): FlowCanvasNode {
  return {
    id: genNodeId(type),
    type,
    position,
    data: { config: defaultConfig(type) },
  };
}

/** 新流程初始画布：start → （待连线）→ end */
export function emptyCanvas(): { nodes: FlowCanvasNode[]; edges: FlowCanvasEdge[] } {
  const start = createNode('start', { x: 80, y: 220 });
  const end = createNode('end', { x: 760, y: 220 });
  return { nodes: [start, end], edges: [] };
}

function edgeTypeFor(sourceNode: FlowCanvasNode, sourceHandle?: string | null): string | undefined {
  return sourceNode.type === 'condition' && sourceHandle ? BRANCH_EDGE_TYPE : undefined;
}

/** 领域图 → xyflow 画布元素 */
export function fromDomain(graph: FlowGraph): {
  nodes: FlowCanvasNode[];
  edges: FlowCanvasEdge[];
} {
  const nodes: FlowCanvasNode[] = graph.nodes.map((n: FlowNode) => ({
    id: n.id,
    type: n.type,
    position: { ...n.position },
    data: { config: { ...(n.config ?? {}) } },
  }));
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const edges: FlowCanvasEdge[] = graph.edges.map((e: FlowEdge) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    ...(e.sourceHandle ? { sourceHandle: e.sourceHandle } : {}),
    ...(edgeTypeFor(nodeMap.get(e.source)!, e.sourceHandle)
      ? { type: edgeTypeFor(nodeMap.get(e.source)!, e.sourceHandle) }
      : {}),
  }));
  return { nodes, edges };
}

/** 画布元素 → 领域图（保存/校验用） */
export function toDomain(
  nodes: FlowCanvasNode[],
  edges: FlowCanvasEdge[],
  viewport?: { x: number; y: number; zoom: number },
): FlowGraph {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type as FlowNodeType,
      position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
      config: n.data.config,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      ...(e.sourceHandle === 'true' || e.sourceHandle === 'false'
        ? { sourceHandle: e.sourceHandle }
        : {}),
    })),
    ...(viewport ? { viewport } : {}),
  };
}

/** 节点副标题：配置一句话摘要 */
export function configSummary(type: FlowNodeType, config: Record<string, unknown>): string {
  const truncate = (v: unknown, n = 32): string => {
    const s = String(v ?? '').replace(/\s+/g, ' ').trim();
    return s.length > n ? `${s.slice(0, n)}…` : s;
  };
  switch (type) {
    case 'start': {
      const inputs = Array.isArray(config.inputs) ? config.inputs.length : 0;
      return inputs > 0 ? `${inputs} 个入参` : '无入参';
    }
    case 'llm':
      return truncate(config.user) || '未配置提示词';
    case 'knowledgeSearch':
      return truncate(config.query) || '未配置检索词';
    case 'tool':
      return truncate(config.toolName) || '未选择工具';
    case 'condition': {
      const rules = Array.isArray(config.rules) ? config.rules.length : 0;
      return `${config.match === 'any' ? '任一' : '全部'} · ${rules} 条规则`;
    }
    case 'human':
      return truncate(config.prompt) || '未配置审核说明';
    case 'end':
      return truncate(config.output) || '未映射输出';
  }
}

/** 连线合法性：不可连入 start、不可从 end 连出 */
export function canConnect(
  sourceNode: FlowCanvasNode | undefined,
  targetNode: FlowCanvasNode | undefined,
): boolean {
  if (!sourceNode || !targetNode) return false;
  if (sourceNode.id === targetNode.id) return false;
  if (targetNode.type === 'start') return false;
  if (sourceNode.type === 'end') return false;
  return true;
}
