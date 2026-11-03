import type { SessionEventView } from '@wbfm/database';
import { asRecord, compact, eventStatus, field, text } from './payload';
import {
  addArtifacts,
  addError,
  ensureRun,
  type Builder,
  patchNode,
  putEdge,
  putNode,
} from './builder';
import { applyAgentEvent } from './agent';

export function applyFlow(b: Builder, event: SessionEventView): void {
  const payload = asRecord(event.payload);
  const runId = text(field(payload, 'runId'), event.scopeId);
  if (!runId) return;
  const run = ensureRun(b, 'flow', runId, '工作流运行', event);
  const status = eventStatus(event.type, payload);
  patchNode(b, run.nodeId, { status, summary: compact(field(payload, 'output') ?? status) });

  if (event.type === 'node_agent_event') {
    const nodeId = text(field(payload, 'nodeId'));
    const agentRunId = text(field(payload, 'agentRunId'));
    const inner = asRecord(field(payload, 'event'));
    const innerType = text(field(inner, 'event'));
    const innerData = field(inner, 'data') ?? inner;
    if (!nodeId || !agentRunId || !innerType) return;
    const flowNodeId = `flow:${runId}:node:${nodeId}`;
    applyAgentEvent(b, agentRunId, innerType, innerData, flowNodeId, run.laneId, event.createdAt, event.seq);
    return;
  }

  const nodeId = text(field(payload, 'nodeId'));
  if (!nodeId || !event.type.startsWith('node_')) return;
  const flowNodeId = `flow:${runId}:node:${nodeId}`;
  const nodeStatus = eventStatus(event.type, payload);
  putNode(b, {
    id: flowNodeId,
    kind: 'flow_node',
    scope: 'flow',
    scopeId: runId,
    laneId: run.laneId,
    parentId: run.nodeId,
    status: nodeStatus,
    label: `节点 · ${nodeId}`,
    summary: compact(field(payload, 'outputs') ?? field(payload, 'reason') ?? field(payload, 'message') ?? nodeStatus),
    at: event.createdAt,
    seq: event.seq,
    runId,
    errorCode: nodeStatus === 'failed' ? 'NODE_FAILED' : null,
  });
  putEdge(b, run.nodeId, flowNodeId, 'run_to_node');
  if (nodeStatus === 'failed') {
    addError(b, event, flowNodeId, run.laneId, 'flow', runId, runId, field(payload, 'message'));
  }
  addArtifacts(b, payload, flowNodeId, run.laneId, 'flow', runId, event.createdAt, event.seq, runId);
}
