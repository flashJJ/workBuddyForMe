import type { RunGraphLiveFrame } from './live-bus';
import {
  addArtifacts,
  addError,
  asRecord,
  compact,
  eventStatus,
  field,
  normalizeStatus,
  putEdge,
  putNode,
  text,
  type Draft,
} from './append-context';

export function applyChatFrame(draft: Draft, frame: RunGraphLiveFrame): void {
  const payload = asRecord(frame.payload) ?? {};
  const messageId = text(field(payload, 'messageId'));

  if (frame.type.startsWith('message_')) {
    if (!messageId) return;
    const nodeId = `chat:${draft.snapshot.rootId}:message:${messageId}`;
    const role = text(field(payload, 'role'), 'assistant');
    const status = eventStatus(frame.type, payload);
    putNode(draft, {
      id: nodeId,
      kind: 'message',
      scope: 'chat',
      scopeId: draft.snapshot.rootId,
      laneId: draft.rootLaneId,
      parentId: draft.rootNodeId,
      status,
      label: role === 'user' ? '用户消息' : '助手消息',
      summary: compact(field(payload, 'content') ?? field(payload, 'message')),
      at: frame.at,
      seq: frame.seq,
      runId: null,
      errorCode: text(field(payload, 'code')) || null,
    });
    putEdge(draft, draft.rootNodeId, nodeId, 'root_to_node');
    if (status === 'failed') {
      addError(draft, frame, nodeId, draft.rootLaneId, 'chat', draft.snapshot.rootId, null, field(payload, 'message'));
    }
    addArtifacts(draft, payload, nodeId, draft.rootLaneId, 'chat', draft.snapshot.rootId, frame, null);
    return;
  }

  if (frame.type !== 'tool_trace') return;
  const trace = field(payload, 'trace');
  if (!Array.isArray(trace)) return;
  const parentId = messageId ? `chat:${draft.snapshot.rootId}:message:${messageId}` : draft.rootNodeId;
  for (const item of trace.slice(0, 100)) {
    const entry = asRecord(item);
    const callId = text(field(entry, 'callId'));
    if (!callId) continue;
    const nodeId = `chat:${draft.snapshot.rootId}:tool:${callId}`;
    const status = normalizeStatus(field(entry, 'status')) ?? 'unknown';
    putNode(draft, {
      id: nodeId,
      kind: 'tool',
      scope: 'chat',
      scopeId: draft.snapshot.rootId,
      laneId: draft.rootLaneId,
      parentId,
      status,
      label: `工具 · ${text(field(entry, 'tool'), 'unknown')}`,
      summary: compact(field(entry, 'resultSummary') ?? field(entry, 'error') ?? field(entry, 'argsSummary')),
      at: frame.at,
      seq: frame.seq,
      runId: null,
      errorCode: status === 'failed' ? 'TOOL_ERROR' : null,
    });
    putEdge(draft, parentId, nodeId, parentId === draft.rootNodeId ? 'root_to_node' : 'node_to_node');
    addArtifacts(draft, entry, nodeId, draft.rootLaneId, 'chat', draft.snapshot.rootId, frame, null);
  }
}
