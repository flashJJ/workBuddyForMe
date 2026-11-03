import type { SessionEventView } from '@wbfm/database';
import { asRecord, compact, eventStatus, field, text } from './payload';
import { type Builder, putEdge, putNode } from './builder';

export function applyMeeting(b: Builder, event: SessionEventView): void {
  const payload = asRecord(event.payload);
  if (event.type === 'meeting_turn_start') {
    // v2.20 M3：优先服务端稳定 turnIndex；旧事件回落到 scope 内递增 seq（autoRounds 不是轮次身份）
    const index = numberField(payload, 'turnIndex') ?? event.seq;
    const nodeId = `meeting:${b.rootId}:turn:${index}`;
    putNode(b, {
      id: nodeId,
      kind: 'meeting_turn',
      scope: 'meeting',
      scopeId: b.rootId,
      laneId: b.rootLaneId,
      parentId: b.rootNodeId,
      status: 'running',
      label: `第 ${index + 1} 轮`,
      summary: compact(field(payload, 'speakerIds') ?? field(payload, 'mode') ?? '发言轮次'),
      at: event.createdAt,
      seq: event.seq,
      runId: null,
      errorCode: null,
    });
    putEdge(b, b.rootNodeId, nodeId, 'meeting_to_turn');
    b.lastMeetingTurnNodeId = nodeId;
    return;
  }

  if (event.type === 'meeting_message') {
    const message = asRecord(field(payload, 'message')) ?? payload;
    const messageId = text(field(message, 'id'));
    if (!messageId) return;
    const nodeId = `meeting:${b.rootId}:message:${messageId}`;
    const speaker = text(field(message, 'speakerName') ?? field(message, 'speakerId'), '成员');
    const parent = b.lastMeetingTurnNodeId ?? b.rootNodeId;
    putNode(b, {
      id: nodeId,
      kind: 'meeting_message',
      scope: 'meeting',
      scopeId: b.rootId,
      laneId: b.rootLaneId,
      parentId: parent,
      status: 'succeeded',
      label: `发言 · ${speaker}`,
      summary: compact(field(message, 'content')),
      at: event.createdAt,
      seq: event.seq,
      runId: null,
      errorCode: null,
    });
    putEdge(b, parent, nodeId, parent === b.rootNodeId ? 'root_to_node' : 'turn_to_message');
    return;
  }

  if (event.type === 'meeting_status') {
    const nodeId = `meeting:${b.rootId}:status`;
    putNode(b, {
      id: nodeId,
      kind: 'meeting_status',
      scope: 'meeting',
      scopeId: b.rootId,
      laneId: b.rootLaneId,
      parentId: b.rootNodeId,
      status: eventStatus(event.type, payload),
      label: '会议状态',
      summary: compact(field(payload, 'status')),
      at: event.createdAt,
      seq: event.seq,
      runId: null,
      errorCode: null,
    });
    putEdge(b, b.rootNodeId, nodeId, 'root_to_node');
  }
}

function numberField(value: unknown, key: string): number | null {
  const fieldValue = field(value, key);
  return typeof fieldValue === 'number' && Number.isFinite(fieldValue) ? fieldValue : null;
}
