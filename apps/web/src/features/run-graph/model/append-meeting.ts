import type { RunGraphLiveFrame } from './live-bus';
import {
  asRecord,
  compact,
  eventStatus,
  field,
  numberField,
  putEdge,
  putNode,
  text,
  type Draft,
} from './append-context';

export function applyMeetingFrame(draft: Draft, frame: RunGraphLiveFrame): void {
  const payload = asRecord(frame.payload) ?? {};
  if (frame.type === 'meeting_turn_start') {
    // 服务端 turnIndex 与快照一致；旧帧回落到客户端序号
    const index = numberField(payload, 'turnIndex') ?? frame.seq;
    const nodeId = `meeting:${draft.snapshot.rootId}:turn:${index}`;
    putNode(draft, {
      id: nodeId,
      kind: 'meeting_turn',
      scope: 'meeting',
      scopeId: draft.snapshot.rootId,
      laneId: draft.rootLaneId,
      parentId: draft.rootNodeId,
      status: 'running',
      label: `第 ${index + 1} 轮`,
      summary: compact(field(payload, 'speakerIds') ?? field(payload, 'mode') ?? '发言轮次'),
      at: frame.at,
      seq: frame.seq,
      runId: null,
      errorCode: null,
    });
    putEdge(draft, draft.rootNodeId, nodeId, 'meeting_to_turn');
    draft.lastMeetingTurnNodeId = nodeId;
    return;
  }

  if (frame.type === 'meeting_message') {
    const message = asRecord(field(payload, 'message')) ?? payload;
    const messageId = text(field(message, 'id'));
    if (!messageId) return;
    const nodeId = `meeting:${draft.snapshot.rootId}:message:${messageId}`;
    const speaker = text(field(message, 'speakerName') ?? field(message, 'speakerId'), '成员');
    const parent = draft.lastMeetingTurnNodeId ?? draft.rootNodeId;
    putNode(draft, {
      id: nodeId,
      kind: 'meeting_message',
      scope: 'meeting',
      scopeId: draft.snapshot.rootId,
      laneId: draft.rootLaneId,
      parentId: parent,
      status: 'succeeded',
      label: `发言 · ${speaker}`,
      summary: compact(field(message, 'content')),
      at: frame.at,
      seq: frame.seq,
      runId: null,
      errorCode: null,
    });
    putEdge(draft, parent, nodeId, parent === draft.rootNodeId ? 'root_to_node' : 'turn_to_message');
    return;
  }

  if (frame.type === 'meeting_status') {
    const nodeId = `meeting:${draft.snapshot.rootId}:status`;
    putNode(draft, {
      id: nodeId,
      kind: 'meeting_status',
      scope: 'meeting',
      scopeId: draft.snapshot.rootId,
      laneId: draft.rootLaneId,
      parentId: draft.rootNodeId,
      status: eventStatus(frame.type, payload),
      label: '会议状态',
      summary: compact(field(payload, 'status')),
      at: frame.at,
      seq: frame.seq,
      runId: null,
      errorCode: null,
    });
    putEdge(draft, draft.rootNodeId, nodeId, 'root_to_node');
  }
}
