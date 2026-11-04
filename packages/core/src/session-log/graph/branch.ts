/**
 * v2.21 M3：branch scope → 分支车道/分支节点/子会话节点/回传节点。
 * 只按事件投影：branch_created 建节点，branch_status 更新状态，branch_returned 建回传节点。
 */
import type { SessionEventView } from '@wbfm/database';
import type { BranchEvidence } from '@wbfm/shared/types';
import { branchEvidenceSchema } from '@wbfm/shared/schemas';
import { addError, patchNode, putEdge, putLane, putNode, type Builder } from './builder';
import { asRecord, compact, eventStatus, field, text } from './payload';

export function applyBranch(b: Builder, event: SessionEventView): void {
  const payload = asRecord(event.payload);
  const branchId = text(field(payload, 'branchId'), event.scopeId);
  const title = text(field(payload, 'title'), branchId);
  const goal = compact(field(payload, 'goal'));
  const childId = text(field(payload, 'childConversationId'));
  const status = eventStatus(event.type, event.payload);
  const laneId = `lane:branch:${branchId}`;
  const branchNodeId = `branch:${branchId}`;

  putLane(b, {
    id: laneId,
    kind: 'branch',
    name: title,
    colorToken: 'accent',
    parentLaneId: b.rootLaneId,
    runId: null,
  });

  if (b.nodes.has(branchNodeId)) {
    patchNode(b, branchNodeId, {
      status,
      summary: compact(field(payload, 'statusReason')) || goal,
    });
  } else {
    putNode(b, {
      id: branchNodeId,
      kind: 'branch',
      scope: 'branch',
      scopeId: branchId,
      laneId,
      parentId: b.rootNodeId,
      status,
      label: title,
      summary: goal,
      at: event.createdAt,
      seq: event.seq,
      runId: null,
      errorCode: null,
    });
    putEdge(b, b.rootNodeId, branchNodeId, 'parent_to_branch');
    addChildNode(b, branchId, childId, laneId, branchNodeId, event, status === 'queued' ? 'queued' : 'running');
  }

  if (event.type !== 'branch_returned') return;
  const evidence = parseEvidence(field(payload, 'evidence'));
  const reason = compact(field(payload, 'statusReason'));
  const returnNodeId = `branch-return:${branchId}`;
  putNode(b, {
    id: returnNodeId,
    kind: 'branch_return',
    scope: 'branch',
    scopeId: branchId,
    laneId,
    parentId: branchNodeId,
    status,
    label: '回传',
    summary: evidenceSummary(evidence, field(payload, 'summary'), reason),
    at: event.createdAt,
    seq: event.seq,
    runId: null,
    errorCode: null,
  });
  putEdge(b, branchNodeId, returnNodeId, 'branch_to_return');
  if (reason && (status === 'failed' || status === 'budget_exceeded' || status === 'interrupted')) {
    addError(b, event, returnNodeId, laneId, 'branch', branchId, null, reason);
  }
}

function addChildNode(
  b: Builder,
  branchId: string,
  childId: string,
  laneId: string,
  branchNodeId: string,
  event: SessionEventView,
  status: 'queued' | 'running',
): void {
  if (!childId) return;
  const childNodeId = `branch-child:${branchId}`;
  putNode(b, {
    id: childNodeId,
    kind: 'run',
    scope: 'branch',
    scopeId: branchId,
    laneId,
    parentId: branchNodeId,
    status,
    label: '子会话',
    summary: childId,
    at: event.createdAt,
    seq: event.seq,
    runId: null,
    errorCode: null,
  });
  putEdge(b, branchNodeId, childNodeId, 'branch_to_child');
}

function parseEvidence(value: unknown): BranchEvidence | null {
  const parsed = branchEvidenceSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function evidenceSummary(evidence: BranchEvidence | null, raw: unknown, reason: string): string {
  const summary = compact(evidence?.summary ?? raw, 180);
  const count = evidence?.artifacts.length ?? 0;
  const parts = [summary, count > 0 ? `产物 ${count}` : '', reason].filter(Boolean);
  return parts.join(' · ');
}
