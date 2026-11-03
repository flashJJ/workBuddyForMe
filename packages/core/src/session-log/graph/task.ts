import type { SessionEventView } from '@wbfm/database';
import { asRecord, compact, eventStatus, field, normalizeStatus, text } from './payload';
import {
  addArtifacts,
  addError,
  ensureRun,
  type Builder,
  patchNode,
  putEdge,
  putNode,
} from './builder';

export function applyTask(b: Builder, event: SessionEventView): void {
  const payload = asRecord(event.payload);
  const runId = text(field(payload, 'runId'), event.scopeId);
  if (!runId) return;
  const run = ensureRun(b, 'task', runId, '任务运行', event);
  const status = eventStatus(event.type, payload);
  patchNode(b, run.nodeId, {
    status,
    summary: compact(field(field(payload, 'run'), 'goal') ?? field(payload, 'goal') ?? status),
  });

  if (event.type !== 'step_started' && event.type !== 'step_finished') return;
  const step = asRecord(field(payload, 'step'));
  const stepId = text(field(step, 'id'));
  if (!stepId) return;
  const nodeId = `task:${runId}:step:${stepId}`;
  const stepStatus = normalizeStatus(field(step, 'status')) ?? status;
  const toolName = text(field(step, 'toolName'));
  const kind = text(field(step, 'kind'), 'action');
  putNode(b, {
    id: nodeId,
    kind: 'task_step',
    scope: 'task',
    scopeId: runId,
    laneId: run.laneId,
    parentId: run.nodeId,
    status: stepStatus,
    label: `步骤 ${kind}${toolName ? ` · ${toolName}` : ''}`,
    summary: compact(field(step, 'reason') ?? field(step, 'resultJson') ?? field(step, 'error')),
    at: event.createdAt,
    seq: event.seq,
    runId,
    errorCode: stepStatus === 'failed' ? 'STEP_FAILED' : null,
  });
  putEdge(b, run.nodeId, nodeId, 'run_to_node');
  if (stepStatus === 'failed') {
    addError(b, event, nodeId, run.laneId, 'task', runId, runId, field(step, 'error'));
  }
  addArtifacts(b, step, nodeId, run.laneId, 'task', runId, event.createdAt, event.seq, runId);
}
