/**
 * v2.20 M3：实时追加的共享上下文与纯函数工具（与 core 投影口径一致）。
 */
import type {
  ArtifactRef,
  RunGraphEdge,
  RunGraphEdgeKind,
  RunGraphLane,
  RunGraphNode,
  RunGraphNodeStatus,
  RunGraphScope,
  RunGraphSnapshot,
} from '@wbfm/shared/types';
import type { RunGraphLiveFrame } from './live-bus';

type Payload = Record<string, unknown>;

export interface Draft {
  snapshot: RunGraphSnapshot;
  nodes: Map<string, RunGraphNode>;
  edges: Map<string, RunGraphEdge>;
  lanes: Map<string, RunGraphLane>;
  rootNodeId: string;
  rootLaneId: string;
  lastMeetingTurnNodeId: string | null;
}

const TERMINAL = new Set<RunGraphNodeStatus>([
  'succeeded',
  'failed',
  'cancelled',
  'interrupted',
  'budget_exceeded',
]);

export function asRecord(value: unknown): Payload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Payload;
}

export function field(value: unknown, key: string): unknown {
  const record = asRecord(value);
  return record ? record[key] : undefined;
}

export function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

export function numberField(value: unknown, key: string): number | null {
  const found = field(value, key);
  return typeof found === 'number' && Number.isFinite(found) ? found : null;
}

export function compact(value: unknown, max = 200): string {
  if (value === null || value === undefined) return '';
  const raw = typeof value === 'string' ? value : safeJson(value);
  const oneLine = raw.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

export function normalizeStatus(value: unknown): RunGraphNodeStatus | null {
  if (typeof value !== 'string') return null;
  switch (value) {
    case 'completed':
    case 'done':
    case 'finished':
    case 'succeeded':
    case 'ok':
    case 'approve':
      return 'succeeded';
    case 'running':
    case 'streaming':
    case 'executing':
    case 'planning':
    case 'reviewing':
      return 'running';
    case 'queued':
      return 'queued';
    case 'waiting':
    case 'paused':
    case 'waiting_human':
    case 'revise':
      return 'waiting';
    case 'failed':
    case 'error':
    case 'reject':
    case 'rejected':
      return 'failed';
    case 'cancelled':
    case 'stopped':
    case 'aborted':
      return 'cancelled';
    case 'skipped':
      return 'skipped';
    case 'budget_exceeded':
      return 'budget_exceeded';
    case 'interrupted':
      return 'interrupted';
    default:
      return null;
  }
}

export function eventStatus(type: string, payload: unknown): RunGraphNodeStatus {
  const explicit =
    normalizeStatus(field(payload, 'status')) ??
    normalizeStatus(field(field(payload, 'run'), 'status')) ??
    normalizeStatus(field(field(payload, 'review'), 'verdict')) ??
    normalizeStatus(field(payload, 'phase'));
  if (explicit) return explicit;
  switch (type) {
    case 'message_started':
    case 'run_started':
    case 'agent_phase':
    case 'meeting_turn_start':
      return 'running';
    case 'message_completed':
    case 'agent_handoff':
    case 'meeting_message':
    case 'done':
      return 'succeeded';
    case 'message_error':
    case 'error':
      return 'failed';
    case 'message_stopped':
      return 'cancelled';
    default:
      return 'unknown';
  }
}

function isArtifactRef(value: unknown): value is ArtifactRef {
  const record = asRecord(value);
  return Boolean(
    record &&
      typeof record.attachmentId === 'string' &&
      record.attachmentId.trim() &&
      typeof record.title === 'string' &&
      typeof record.filename === 'string' &&
      typeof record.format === 'string' &&
      typeof record.mimeType === 'string' &&
      typeof record.byteSize === 'number',
  );
}

function findArtifacts(value: unknown, depth = 0, out: ArtifactRef[] = []): ArtifactRef[] {
  if (depth > 4 || value === null || value === undefined) return out;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 50)) findArtifacts(item, depth + 1, out);
  } else if (isArtifactRef(value)) {
    if (!out.some((item) => item.attachmentId === value.attachmentId)) out.push(value);
  } else {
    const record = asRecord(value);
    if (record) for (const key of Object.keys(record).slice(0, 30)) findArtifacts(record[key], depth + 1, out);
  }
  return out;
}

export function putNode(draft: Draft, node: RunGraphNode): void {
  const previous = draft.nodes.get(node.id);
  // 快照/更早的终态是权威：迟到的实时帧不得把 succeeded 回退成 running
  if (previous && TERMINAL.has(previous.status)) return;
  draft.nodes.set(node.id, node);
}

export function patchNode(draft: Draft, id: string, patch: Partial<RunGraphNode>): void {
  const previous = draft.nodes.get(id);
  if (!previous || TERMINAL.has(previous.status)) return;
  draft.nodes.set(id, { ...previous, ...patch });
}

export function putEdge(draft: Draft, from: string, to: string, kind: RunGraphEdgeKind): void {
  const id = `${kind}:${from}->${to}`;
  if (!draft.edges.has(id)) draft.edges.set(id, { id, from, to, kind });
}

export function putLane(draft: Draft, lane: RunGraphLane): void {
  if (!draft.lanes.has(lane.id)) draft.lanes.set(lane.id, lane);
}

export function addArtifacts(
  draft: Draft,
  payload: unknown,
  parentId: string,
  laneId: string,
  scope: RunGraphScope,
  scopeId: string,
  frame: RunGraphLiveFrame,
  runId: string | null,
): void {
  for (const artifact of findArtifacts(payload)) {
    const nodeId = `artifact:${artifact.attachmentId}`;
    putNode(draft, {
      id: nodeId,
      kind: 'artifact',
      scope,
      scopeId,
      laneId,
      parentId,
      status: 'succeeded',
      label: `产物 · ${artifact.title}`,
      summary: `${artifact.filename} · ${artifact.format} · ${artifact.byteSize}B`,
      at: frame.at,
      seq: frame.seq,
      runId,
      errorCode: null,
      artifact,
    });
    putEdge(draft, parentId, nodeId, 'node_to_artifact');
  }
}

export function addError(
  draft: Draft,
  frame: RunGraphLiveFrame,
  parentId: string,
  laneId: string,
  scope: RunGraphScope,
  scopeId: string,
  runId: string | null,
  message: unknown,
): void {
  const nodeId = `error:${scope}:${scopeId}:${frame.seq}`;
  putNode(draft, {
    id: nodeId,
    kind: 'error',
    scope,
    scopeId,
    laneId,
    parentId,
    status: 'failed',
    label: '错误',
    summary: compact(message) || '运行失败',
    at: frame.at,
    seq: frame.seq,
    runId,
    errorCode: null,
  });
  putEdge(draft, parentId, nodeId, 'node_to_error');
}
