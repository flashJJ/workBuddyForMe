import type {
  FlowRunStatus,
  FlowTrigger,
  WorkflowRunView,
} from '@wbfm/shared/types';
import type { WorkflowRunRow } from './workflow-run-types';

function parseJson<T>(raw: string | null, fallback: T): T {
  if (raw === null || raw === '') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function mapRun(row: WorkflowRunRow): WorkflowRunView {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    version: row.version,
    trigger: row.trigger as FlowTrigger,
    status: row.status as FlowRunStatus,
    input: parseJson<Record<string, unknown> | null>(row.input_json, null),
    output: parseJson<unknown>(row.output_json, null),
    error: parseJson<WorkflowRunView['error']>(row.error_json, null),
    conversationId: row.conversation_id,
    waitNodeId: row.wait_node_id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
    endpointId: row.endpoint_id,
    parentRunId: row.parent_run_id,
    resumedFromNode: row.resumed_from_node,
    interruptReason: row.interrupt_reason,
  };
}
