import type { FlowRunStatus, FlowTrigger } from '@wbfm/shared/types';

export interface WorkflowRunRow {
  id: string;
  workflow_id: string;
  version: number;
  trigger: string;
  status: string;
  input_json: string | null;
  output_json: string | null;
  error_json: string | null;
  conversation_id: string | null;
  wait_node_id: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  endpoint_id: string | null;
  parent_run_id: string | null;
  resumed_from_node: string | null;
  interrupt_reason: string | null;
}

export interface NodeExecutionRow {
  id: string;
  run_id: string;
  node_id: string;
  status: string;
  inputs_json: string | null;
  outputs_json: string | null;
  error_json: string | null;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number;
}

export interface WorkflowRunCreateFields {
  id?: string;
  workflowId: string;
  version: number;
  trigger?: FlowTrigger;
  input?: Record<string, unknown>;
  conversationId?: string | null;
  /** v0.9：API/MCP 触发来源端点 */
  endpointId?: string | null;
  /** v0.9：重放关联 */
  parentRunId?: string | null;
  resumedFromNode?: string | null;
}

export type RunTerminalStatus = Extract<
  FlowRunStatus,
  'succeeded' | 'failed' | 'cancelled' | 'interrupted'
>;

export interface RunFinishFields {
  output?: unknown;
  error?: { code: string; message: string; nodeId?: string };
}

export interface RunListFilter {
  trigger?: FlowTrigger;
  status?: FlowRunStatus;
  endpointId?: string;
  limit?: number;
}

/** v0.9：启动恢复扫描结果 */
export interface RecoverableRuns {
  /** queued 无执行者：重新入队的 runId */
  queued: string[];
  /** running/waiting_human 无执行者：需收敛 interrupted 的 runId */
  interrupted: string[];
}
