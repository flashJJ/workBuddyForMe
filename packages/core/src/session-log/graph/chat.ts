import type { SessionEventView } from '@wbfm/database';
import { asRecord, compact, eventStatus, field, normalizeStatus, text } from './payload';
import { addArtifacts, addError, type Builder, putEdge, putNode } from './builder';

export function applyChat(b: Builder, event: SessionEventView): void {
  const payload = asRecord(event.payload);
  const messageId = text(field(payload, 'messageId'));

  if (event.type.startsWith('message_')) {
    if (!messageId) return;
    const nodeId = `chat:${b.rootId}:message:${messageId}`;
    const role = text(field(payload, 'role'), 'assistant');
    const status = eventStatus(event.type, payload);
    putNode(b, {
      id: nodeId,
      kind: 'message',
      scope: 'chat',
      scopeId: b.rootId,
      laneId: b.rootLaneId,
      parentId: b.rootNodeId,
      status,
      label: role === 'user' ? '用户消息' : '助手消息',
      summary: compact(field(payload, 'content') ?? field(payload, 'message')),
      at: event.createdAt,
      seq: event.seq,
      runId: null,
      errorCode: text(field(payload, 'code')) || null,
    });
    putEdge(b, b.rootNodeId, nodeId, 'root_to_node');
    if (status === 'failed') {
      addError(b, event, nodeId, b.rootLaneId, 'chat', b.rootId, null, field(payload, 'message'));
    }
    addArtifacts(b, payload, nodeId, b.rootLaneId, 'chat', b.rootId, event.createdAt, event.seq, null);
    return;
  }

  if (event.type !== 'tool_trace') return;
  const trace = field(payload, 'trace');
  if (!Array.isArray(trace)) return;
  const parentId = messageId ? `chat:${b.rootId}:message:${messageId}` : b.rootNodeId;
  for (const item of trace.slice(0, 100)) {
    const entry = asRecord(item);
    const callId = text(field(entry, 'callId'));
    if (!callId) continue;
    const nodeId = `chat:${b.rootId}:tool:${callId}`;
    const status = normalizeStatus(field(entry, 'status')) ?? 'unknown';
    putNode(b, {
      id: nodeId,
      kind: 'tool',
      scope: 'chat',
      scopeId: b.rootId,
      laneId: b.rootLaneId,
      parentId,
      status,
      label: `工具 · ${text(field(entry, 'tool'), 'unknown')}`,
      summary: compact(field(entry, 'resultSummary') ?? field(entry, 'error') ?? field(entry, 'argsSummary')),
      at: event.createdAt,
      seq: event.seq,
      runId: null,
      errorCode: status === 'failed' ? 'TOOL_ERROR' : null,
    });
    putEdge(b, parentId, nodeId, parentId === b.rootNodeId ? 'root_to_node' : 'node_to_node');
    addArtifacts(b, entry, nodeId, b.rootLaneId, 'chat', b.rootId, event.createdAt, event.seq, null);
  }
}
