import type { FlowEventPayload } from '@wbfm/shared/types';
import type { WorkflowRunRepository } from '@wbfm/database';

/**
 * 把引擎 SSE 事件同步为 workflow_runs / node_executions 落库。
 * 纯函数式投影：持有 nodeId → node_execution.id 映射，供同一运行的事件复用。
 * 每个事件在 SSE 发送前调用（与 events 路由消费同序）。
 */
export interface FlowRunStore {
  persist(event: FlowEventPayload): void;
}

export function createFlowRunStore(runs: WorkflowRunRepository): FlowRunStore {
  const nodeExecIds = new Map<string, string>();

  function ensureNodeExecution(runId: string, nodeId: string, inputs?: unknown): string {
    const existing = nodeExecIds.get(nodeId);
    if (existing) return existing;
    const view = runs.addNodeExecution(runId, nodeId, inputs);
    nodeExecIds.set(nodeId, view.id);
    return view.id;
  }

  return {
    persist(event) {
      const runId = event.runId;
      switch (event.type) {
        case 'node_started':
          ensureNodeExecution(runId, event.nodeId, event.inputs);
          break;
        case 'node_succeeded': {
          const id = ensureNodeExecution(runId, event.nodeId);
          runs.finishNodeExecution(id, 'succeeded', {
            outputs: event.outputs,
          });
          break;
        }
        case 'node_failed': {
          // 引用解析失败等场景可能没有前置 node_started，这里补一条记录
          const id = ensureNodeExecution(runId, event.nodeId);
          runs.finishNodeExecution(id, 'failed', { error: event.message });
          break;
        }
        case 'node_skipped': {
          const id = ensureNodeExecution(runId, event.nodeId);
          runs.finishNodeExecution(id, 'skipped', {});
          break;
        }
        case 'node_waiting_human':
          runs.markWaitingHuman(runId, event.nodeId);
          break;
        case 'run_succeeded':
          runs.finishRun(runId, 'succeeded', { output: event.output });
          break;
        case 'run_failed':
          runs.finishRun(runId, 'failed', {
            error: {
              code: 'flow/run-failed',
              message: event.message,
              ...(event.nodeId ? { nodeId: event.nodeId } : {}),
            },
          });
          break;
        case 'run_cancelled':
          runs.finishRun(runId, 'cancelled');
          break;
        case 'run_started':
          // 运行已在 service.start 时置 running，此处无需处理
          break;
      }
    },
  };
}
