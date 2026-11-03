/**
 * RunGraph 构建器：节点/边/车道容器 + 通用挂载逻辑。
 * 各 scope 的 apply 函数只负责解释事件，不直接操作 Map。
 */
import type { SessionEventView } from '@wbfm/database';
import type {
  RunGraphEdge,
  RunGraphEdgeKind,
  RunGraphLane,
  RunGraphNode,
  RunGraphRootKind,
  RunGraphScope,
  RunGraphSnapshot,
} from '@wbfm/shared/types';
import { compact, findArtifacts, scopeColorToken } from './payload';

export const ROLE_LABELS: Record<string, string> = {
  planner: '规划',
  executor: '执行',
  reviewer: '审查',
};

export interface Builder {
  rootKind: RunGraphRootKind;
  rootId: string;
  rootNodeId: string;
  rootLaneId: string;
  nodes: Map<string, RunGraphNode>;
  edges: Map<string, RunGraphEdge>;
  lanes: Map<string, RunGraphLane>;
  lastMeetingTurnNodeId: string | null;
}

export function createBuilder(
  rootKind: RunGraphRootKind,
  rootId: string,
  at: string,
): Builder {
  const rootNodeId = `root:${rootKind}:${rootId}`;
  const rootLaneId = `lane:root:${rootKind}:${rootId}`;
  const rootScope: RunGraphScope = rootKind === 'meeting' ? 'meeting' : 'chat';
  const builder: Builder = {
    rootKind,
    rootId,
    rootNodeId,
    rootLaneId,
    nodes: new Map(),
    edges: new Map(),
    lanes: new Map(),
    lastMeetingTurnNodeId: null,
  };

  putLane(builder, {
    id: rootLaneId,
    kind: rootKind === 'meeting' ? 'meeting' : 'conversation',
    name: rootKind === 'meeting' ? '会议' : '会话',
    colorToken: scopeColorToken(rootScope),
    parentLaneId: null,
    runId: null,
  });
  putNode(builder, {
    id: rootNodeId,
    kind: 'root',
    scope: rootScope,
    scopeId: rootId,
    laneId: rootLaneId,
    parentId: null,
    status: 'unknown',
    label: rootKind === 'meeting' ? '会议' : '会话',
    summary: rootId,
    at,
    seq: 0,
    runId: null,
    errorCode: null,
  });
  return builder;
}

export function ensureRun(
  b: Builder,
  kind: 'task' | 'flow' | 'agent',
  runId: string,
  label: string,
  event: Pick<SessionEventView, 'createdAt' | 'seq'>,
  parentId = b.rootNodeId,
  parentLaneId = b.rootLaneId,
): { nodeId: string; laneId: string } {
  const nodeId = `run:${kind}:${runId}`;
  const laneId = `lane:run:${kind}:${runId}`;
  putLane(b, {
    id: laneId,
    kind: 'run',
    name: label,
    colorToken: scopeColorToken(kind),
    parentLaneId,
    runId,
  });
  if (!b.nodes.has(nodeId)) {
    putNode(b, {
      id: nodeId,
      kind: 'run',
      scope: kind,
      scopeId: runId,
      laneId,
      parentId,
      status: 'queued',
      label,
      summary: runId,
      at: event.createdAt,
      seq: event.seq,
      runId,
      errorCode: null,
    });
    putEdge(b, parentId, nodeId, parentId === b.rootNodeId ? 'conversation_to_run' : 'node_to_node');
  }
  return { nodeId, laneId };
}

export function ensureRoleLane(
  b: Builder,
  runId: string,
  role: string,
  parentLaneId: string,
): string {
  const laneId = `lane:agent:${runId}:role:${role}`;
  putLane(b, {
    id: laneId,
    kind: 'role',
    name: ROLE_LABELS[role] ?? role,
    colorToken: 'warning',
    parentLaneId,
    runId,
  });
  return laneId;
}

export function addArtifacts(
  b: Builder,
  payload: unknown,
  parentId: string,
  laneId: string,
  scope: RunGraphScope,
  scopeId: string,
  at: string,
  seq: number,
  runId: string | null,
): void {
  for (const artifact of findArtifacts(payload)) {
    const nodeId = `artifact:${artifact.attachmentId}`;
    putNode(b, {
      id: nodeId,
      kind: 'artifact',
      scope,
      scopeId,
      laneId,
      parentId,
      status: 'succeeded',
      label: `产物 · ${artifact.title}`,
      summary: `${artifact.filename} · ${artifact.format} · ${artifact.byteSize}B`,
      at,
      seq,
      runId,
      errorCode: null,
      artifact,
    });
    putEdge(b, parentId, nodeId, 'node_to_artifact');
  }
}

export function addError(
  b: Builder,
  event: Pick<SessionEventView, 'createdAt' | 'seq'>,
  parentId: string,
  laneId: string,
  scope: RunGraphScope,
  scopeId: string,
  runId: string | null,
  message: unknown,
): void {
  const nodeId = `error:${scope}:${scopeId}:${event.seq}`;
  putNode(b, {
    id: nodeId,
    kind: 'error',
    scope,
    scopeId,
    laneId,
    parentId,
    status: 'failed',
    label: '错误',
    summary: compact(message) || '运行失败',
    at: event.createdAt,
    seq: event.seq,
    runId,
    errorCode: null,
  });
  putEdge(b, parentId, nodeId, 'node_to_error');
}

export function putNode(b: Builder, node: RunGraphNode): void {
  b.nodes.set(node.id, node);
}

export function patchNode(b: Builder, id: string, patch: Partial<RunGraphNode>): void {
  const prev = b.nodes.get(id);
  if (prev) b.nodes.set(id, { ...prev, ...patch });
}

export function putEdge(b: Builder, from: string, to: string, kind: RunGraphEdgeKind): void {
  if (!from || !to) return;
  const id = `${kind}:${from}->${to}`;
  if (!b.edges.has(id)) b.edges.set(id, { id, from, to, kind });
}

export function putLane(b: Builder, lane: RunGraphLane): void {
  if (!b.lanes.has(lane.id)) b.lanes.set(lane.id, lane);
}

export function finalizeGraph(b: Builder, limit: number, generatedAt: string): RunGraphSnapshot {
  const allNodes = [...b.nodes.values()].sort(compareNodes);
  const rootNode = allNodes.find((node) => node.id === b.rootNodeId);
  const others = allNodes.filter((node) => node.id !== b.rootNodeId);
  const truncated = others.length > limit - 1;
  const keptOthers = truncated ? others.slice(-(limit - 1)) : others;
  const nodes = rootNode ? [rootNode, ...keptOthers] : keptOthers;
  const ids = new Set(nodes.map((node) => node.id));
  const edges = [...b.edges.values()].filter((edge) => ids.has(edge.from) && ids.has(edge.to));
  return {
    rootKind: b.rootKind,
    rootId: b.rootId,
    generatedAt,
    nodes,
    edges,
    lanes: [...b.lanes.values()],
    truncated,
  };
}

const SCOPE_ORDER: Record<RunGraphScope, number> = {
  chat: 0,
  task: 1,
  flow: 2,
  agent: 3,
  meeting: 4,
};

function compareNodes(a: RunGraphNode, b: RunGraphNode): number {
  return (
    a.at.localeCompare(b.at) ||
    SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope] ||
    a.seq - b.seq ||
    a.id.localeCompare(b.id)
  );
}
