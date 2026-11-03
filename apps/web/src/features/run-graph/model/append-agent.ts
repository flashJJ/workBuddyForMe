import type { RunGraphLiveFrame } from './live-bus';
import {
  addArtifacts,
  addError,
  asRecord,
  compact,
  eventStatus,
  field,
  normalizeStatus,
  numberField,
  patchNode,
  putEdge,
  putLane,
  putNode,
  text,
  type Draft,
} from './append-context';

const ROLE_LABELS: Record<string, string> = { planner: '规划', executor: '执行', reviewer: '审查' };

function ensureRun(draft: Draft, runId: string, frame: RunGraphLiveFrame) {
  const nodeId = `run:agent:${runId}`;
  const laneId = `lane:run:agent:${runId}`;
  putLane(draft, {
    id: laneId,
    kind: 'run',
    name: '协作运行',
    colorToken: 'warning',
    parentLaneId: draft.rootLaneId,
    runId,
  });
  if (!draft.nodes.has(nodeId)) {
    putNode(draft, {
      id: nodeId,
      kind: 'run',
      scope: 'agent',
      scopeId: runId,
      laneId,
      parentId: draft.rootNodeId,
      status: 'queued',
      label: '协作运行',
      summary: runId,
      at: frame.at,
      seq: frame.seq,
      runId,
      errorCode: null,
    });
    putEdge(draft, draft.rootNodeId, nodeId, 'conversation_to_run');
  }
  return { nodeId, laneId };
}

function ensureRoleLane(draft: Draft, runId: string, role: string, parentLaneId: string): string {
  const laneId = `lane:agent:${runId}:role:${role}`;
  putLane(draft, {
    id: laneId,
    kind: 'role',
    name: ROLE_LABELS[role] ?? role,
    colorToken: 'warning',
    parentLaneId,
    runId,
  });
  return laneId;
}

export function applyAgentFrame(draft: Draft, frame: RunGraphLiveFrame): void {
  const data = asRecord(frame.payload) ?? {};
  const runId = text(field(data, 'runId'), frame.scopeId);
  if (!runId) return;
  const run = ensureRun(draft, runId, frame);
  const status = eventStatus(frame.type, data);
  patchNode(draft, run.nodeId, {
    status,
    summary: compact(field(data, 'phase') ?? status),
  });

  if (frame.type === 'agent_phase') {
    const role = text(field(data, 'role'));
    const phase = text(field(data, 'phase'), 'running');
    const round = numberField(data, 'round') ?? numberField(data, 'roundNo') ?? 0;
    const laneId = role ? ensureRoleLane(draft, runId, role, run.laneId) : run.laneId;
    const nodeId = `agent:${runId}:round:${round}:${role || phase}`;
    putNode(draft, {
      id: nodeId,
      kind: 'agent_phase',
      scope: 'agent',
      scopeId: runId,
      laneId,
      parentId: run.nodeId,
      status,
      label: `${ROLE_LABELS[role] ?? (role || '角色')} · ${phase}`,
      summary: compact(field(data, 'summary') ?? phase),
      at: frame.at,
      seq: frame.seq,
      runId,
      errorCode: status === 'failed' ? 'AGENT_PHASE_FAILED' : null,
    });
    putEdge(draft, run.nodeId, nodeId, 'run_to_node');
    addArtifacts(draft, data, nodeId, laneId, 'agent', runId, frame, runId);
    return;
  }

  if (frame.type === 'agent_handoff') {
    const handoff = asRecord(field(data, 'handoff')) ?? data;
    const handoffId = text(field(handoff, 'id'));
    if (!handoffId) return;
    const fromRole = text(field(handoff, 'fromRole'));
    const toRole = text(field(handoff, 'toRole'));
    const round = numberField(handoff, 'roundNo') ?? 0;
    const laneId = fromRole ? ensureRoleLane(draft, runId, fromRole, run.laneId) : run.laneId;
    const phaseNodeId = `agent:${runId}:round:${round}:${fromRole}`;
    const parent = draft.nodes.has(phaseNodeId) ? phaseNodeId : run.nodeId;
    const nodeId = `agent:${runId}:handoff:${handoffId}`;
    const detail = asRecord(field(handoff, 'payload')) ?? asRecord(field(handoff, 'detail')) ?? data;
    putNode(draft, {
      id: nodeId,
      kind: 'agent_handoff',
      scope: 'agent',
      scopeId: runId,
      laneId,
      parentId: parent,
      status: 'succeeded',
      label: `交接 ${ROLE_LABELS[fromRole] ?? fromRole}→${ROLE_LABELS[toRole] ?? toRole}`,
      summary: compact(field(detail, 'subtask') ?? field(detail, 'outcome') ?? field(detail, 'verdict') ?? detail),
      at: frame.at,
      seq: frame.seq,
      runId,
      errorCode: null,
    });
    putEdge(draft, parent, nodeId, parent === run.nodeId ? 'run_to_node' : 'round_to_handoff');
    addArtifacts(draft, detail, nodeId, laneId, 'agent', runId, frame, runId);
    return;
  }

  if (frame.type === 'agent_review') {
    const review = asRecord(field(data, 'review'));
    const round = numberField(data, 'round') ?? 0;
    const verdict = text(field(review, 'verdict'));
    const laneId = ensureRoleLane(draft, runId, 'reviewer', run.laneId);
    const nodeId = `agent:${runId}:review:${round}`;
    const reviewStatus = normalizeStatus(verdict) ?? status;
    putNode(draft, {
      id: nodeId,
      kind: 'agent_review',
      scope: 'agent',
      scopeId: runId,
      laneId,
      parentId: run.nodeId,
      status: reviewStatus,
      label: `审查 · ${verdict || '结果'}`,
      summary: compact(field(review, 'notes') ?? field(review, 'verdict') ?? review),
      at: frame.at,
      seq: frame.seq,
      runId,
      errorCode: reviewStatus === 'failed' ? 'REVIEW_REJECTED' : null,
    });
    putEdge(draft, run.nodeId, nodeId, 'run_to_node');
    addArtifacts(draft, review, nodeId, laneId, 'agent', runId, frame, runId);
    return;
  }

  if (frame.type === 'error') {
    addError(draft, frame, run.nodeId, run.laneId, 'agent', runId, runId, field(data, 'message'));
  }
}
