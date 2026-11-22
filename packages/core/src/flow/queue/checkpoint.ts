import type { NodeExecutionView, WorkflowRunRepository } from '@wbfm/database';
import type { CheckpointNode, FlowCheckpoint } from '../graph/types';

/**
 * v4.23 续跑检查点：只复用已落库的节点终态，不新增存储。
 * succeeded 节点带 outputs 参与作用域重建；skipped 只恢复状态。
 */

export type { CheckpointNode, FlowCheckpoint } from '../graph/types';

function asOutputs(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export function loadCheckpoint(
  runs: WorkflowRunRepository,
  runId: string,
): FlowCheckpoint | null {
  const executions: NodeExecutionView[] = runs.listNodeExecutions(runId);
  if (executions.length === 0) return null;

  // 同一节点可能有多行（重试/旧版重放）：后者覆盖前者
  const latest = new Map<string, NodeExecutionView>();
  for (const execution of executions) latest.set(execution.nodeId, execution);

  const nodes: CheckpointNode[] = [];
  let lastSucceededNodeId: string | null = null;
  for (const execution of latest.values()) {
    if (execution.status === 'succeeded') {
      nodes.push({ nodeId: execution.nodeId, status: 'succeeded', outputs: asOutputs(execution.outputs) });
      lastSucceededNodeId = execution.nodeId;
    } else if (execution.status === 'skipped') {
      nodes.push({ nodeId: execution.nodeId, status: 'skipped' });
    }
  }
  if (nodes.length === 0) return null;
  return { runId, nodes, lastSucceededNodeId };
}
