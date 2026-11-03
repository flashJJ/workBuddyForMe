import { asRecord, compact, eventStatus, field, normalizeStatus, text } from './payload';
import {
  ROLE_LABELS,
  addArtifacts,
  addError,
  ensureRoleLane,
  ensureRun,
  type Builder,
  patchNode,
  putEdge,
  putNode,
} from './builder';

export function applyAgentEvent(
  b: Builder,
  runId: string,
  type: string,
  payload: unknown,
  parentId: string,
  parentLaneId: string,
  at: string,
  seq: number,
): void {
  const data = asRecord(payload) ?? {};
  const run = ensureRun(b, 'agent', runId, '协作运行', { createdAt: at, seq }, parentId, parentLaneId);
  const status = eventStatus(type, data);
  patchNode(b, run.nodeId, { status, summary: compact(field(data, 'phase') ?? status) });

  if (type === 'agent_phase') {
    const role = text(field(data, 'role'));
    const phase = text(field(data, 'phase'), 'running');
    const round = numberField(data, 'round') ?? numberField(data, 'roundNo') ?? 0;
    const laneId = role ? ensureRoleLane(b, runId, role, run.laneId) : run.laneId;
    const nodeId = `agent:${runId}:round:${round}:${role || phase}`;
    putNode(b, {
      id: nodeId,
      kind: 'agent_phase',
      scope: 'agent',
      scopeId: runId,
      laneId,
      parentId: run.nodeId,
      status,
      label: `${ROLE_LABELS[role] ?? (role || '角色')} · ${phase}`,
      summary: compact(field(data, 'summary') ?? phase),
      at,
      seq,
      runId,
      errorCode: status === 'failed' ? 'AGENT_PHASE_FAILED' : null,
    });
    putEdge(b, run.nodeId, nodeId, 'run_to_node');
    addArtifacts(b, data, nodeId, laneId, 'agent', runId, at, seq, runId);
    return;
  }

  if (type === 'agent_handoff') {
    const handoff = asRecord(field(data, 'handoff')) ?? data;
    const handoffId = text(field(handoff, 'id'));
    if (!handoffId) return;
    const fromRole = text(field(handoff, 'fromRole'));
    const toRole = text(field(handoff, 'toRole'));
    const round = numberField(handoff, 'roundNo') ?? 0;
    const laneId = fromRole ? ensureRoleLane(b, runId, fromRole, run.laneId) : run.laneId;
    const phaseNodeId = `agent:${runId}:round:${round}:${fromRole}`;
    const parent = b.nodes.has(phaseNodeId) ? phaseNodeId : run.nodeId;
    const nodeId = `agent:${runId}:handoff:${handoffId}`;
    const detail = asRecord(field(handoff, 'payload')) ?? asRecord(field(handoff, 'detail')) ?? data;
    putNode(b, {
      id: nodeId,
      kind: 'agent_handoff',
      scope: 'agent',
      scopeId: runId,
      laneId,
      parentId: parent,
      status: 'succeeded',
      label: `交接 ${ROLE_LABELS[fromRole] ?? fromRole}→${ROLE_LABELS[toRole] ?? toRole}`,
      summary: compact(field(detail, 'subtask') ?? field(detail, 'outcome') ?? field(detail, 'verdict') ?? detail),
      at,
      seq,
      runId,
      errorCode: null,
    });
    putEdge(b, parent, nodeId, parent === run.nodeId ? 'run_to_node' : 'round_to_handoff');
    addArtifacts(b, detail, nodeId, laneId, 'agent', runId, at, seq, runId);
    return;
  }

  if (type === 'agent_review') {
    const review = asRecord(field(data, 'review'));
    const round = numberField(data, 'round') ?? 0;
    const verdict = text(field(review, 'verdict'));
    const laneId = ensureRoleLane(b, runId, 'reviewer', run.laneId);
    const nodeId = `agent:${runId}:review:${round}`;
    const reviewStatus = normalizeStatus(verdict) ?? status;
    putNode(b, {
      id: nodeId,
      kind: 'agent_review',
      scope: 'agent',
      scopeId: runId,
      laneId,
      parentId: run.nodeId,
      status: reviewStatus,
      label: `审查 · ${verdict || '结果'}`,
      summary: compact(field(review, 'notes') ?? field(review, 'verdict') ?? review),
      at,
      seq,
      runId,
      errorCode: reviewStatus === 'failed' ? 'REVIEW_REJECTED' : null,
    });
    putEdge(b, run.nodeId, nodeId, 'run_to_node');
    addArtifacts(b, review, nodeId, laneId, 'agent', runId, at, seq, runId);
    return;
  }

  if (type === 'error') {
    addError(b, { createdAt: at, seq }, run.nodeId, run.laneId, 'agent', runId, runId, field(data, 'message'));
  }
}

function numberField(value: unknown, key: string): number | null {
  const fieldValue = field(value, key);
  return typeof fieldValue === 'number' && Number.isFinite(fieldValue) ? fieldValue : null;
}
