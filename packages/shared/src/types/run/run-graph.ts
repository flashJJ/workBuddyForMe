/**
 * v2.20 RunGraph 契约：会话/会议的过程事件图。
 *
 * 只定义展示投影需要的只读结构：
 * - 节点身份由业务 id 派生，重复事件只更新状态；
 * - 边只表达根/运行/步骤/交接/产物/错误关系；
 * - 车道用于 UI 分行，颜色只存 token 名，不存十六进制。
 */
import type { ArtifactRef } from '../tool';
import type { RunOutcome } from './run-outcome';

export const RUN_GRAPH_ROOT_KINDS = ['conversation', 'meeting'] as const;
export type RunGraphRootKind = (typeof RUN_GRAPH_ROOT_KINDS)[number];

export const RUN_GRAPH_SCOPES = ['chat', 'task', 'flow', 'agent', 'meeting', 'branch'] as const;
export type RunGraphScope = (typeof RUN_GRAPH_SCOPES)[number];

export const RUN_GRAPH_NODE_KINDS = [
  'root',
  'run',
  'message',
  'tool',
  'task_step',
  'flow_node',
  'agent_phase',
  'agent_handoff',
  'agent_review',
  'meeting_turn',
  'meeting_message',
  'meeting_status',
  'branch',
  'branch_return',
  'artifact',
  'error',
  'retry',
  'wait',
] as const;
export type RunGraphNodeKind = (typeof RUN_GRAPH_NODE_KINDS)[number];

/** 前 8 个沿用 RunOutcome；skipped/unknown 只用于节点级展示 */
export type RunGraphNodeStatus = RunOutcome | 'skipped' | 'unknown';

export const RUN_GRAPH_EDGE_KINDS = [
  'root_to_node',
  'conversation_to_run',
  'run_to_node',
  'node_to_node',
  'round_to_handoff',
  'meeting_to_turn',
  'turn_to_message',
  'node_to_artifact',
  'node_to_error',
  'parent_to_branch',
  'branch_to_child',
  'branch_to_return',
] as const;
export type RunGraphEdgeKind = (typeof RUN_GRAPH_EDGE_KINDS)[number];

export interface RunGraphNode {
  id: string;
  kind: RunGraphNodeKind;
  scope: RunGraphScope;
  scopeId: string;
  laneId: string;
  parentId: string | null;
  status: RunGraphNodeStatus;
  label: string;
  summary: string;
  /** ISO 时间；缺省时由投影使用事件 createdAt */
  at: string;
  /** 该 scope 内的序号；不同 scope 的 seq 不可直接比较 */
  seq: number;
  runId: string | null;
  errorCode: string | null;
  /** v2.18 产物引用；attachmentId 为唯一身份 */
  artifact?: ArtifactRef;
  /** 产物未核验/缺证据时为 true */
  artifactUnverified?: boolean;
}

export interface RunGraphEdge {
  id: string;
  from: string;
  to: string;
  kind: RunGraphEdgeKind;
}

export interface RunGraphLane {
  id: string;
  kind: 'conversation' | 'run' | 'role' | 'meeting' | 'branch';
  name: string;
  /** 语义 token 名，如 primary / info / success；不存十六进制 */
  colorToken: string;
  parentLaneId: string | null;
  runId: string | null;
  /** v2.21：分支已归档；UI 默认折叠该车道 */
  archived?: boolean;
}

export interface RunGraphSnapshot {
  rootKind: RunGraphRootKind;
  rootId: string;
  generatedAt: string;
  nodes: RunGraphNode[];
  edges: RunGraphEdge[];
  lanes: RunGraphLane[];
  /** 超过 limit 时为 true，保留最近 limit 个节点 */
  truncated: boolean;
}
