import { randomUUID } from 'node:crypto';
import { ApiError } from '@wbfm/shared/errors';
import type {
  FlowReplayMode,
  FlowReplayNodeMode,
  FlowRunBatchReplayInput,
  FlowRunBatchReplayItem,
  FlowRunBatchReplayResult,
  FlowTrigger,
  WorkflowRunView,
} from '@wbfm/shared/types';
import { FLOW_RUN_RESUMABLE_STATUSES } from '@wbfm/shared/types';
import type { WorkflowRepository, WorkflowRunRepository } from '@wbfm/database';
import type { CreateRunFromGraphParams } from '../run/run-service-types';
import { loadRunGraph } from './run-snapshot';

/**
 * v5.0 单条/批量/补偿重放：
 * - snapshot：用运行快照/精确版本，不从当前生产图重读；
 * - latest：显式使用当前生产版本；
 * - 批量逐条隔离，部分失败不阻断。
 */

export interface FlowRunReplayRunner {
  createRunFromGraph(params: CreateRunFromGraphParams): string;
}

export interface FlowRunReplayDeps {
  runs: WorkflowRunRepository;
  workflows: WorkflowRepository;
  flowRunner: FlowRunReplayRunner;
}

export interface ReplayOneInput {
  runId: string;
  mode?: FlowReplayMode;
  nodeMode?: FlowReplayNodeMode;
  /** 显式起点节点（单条重放 API 用；优先级高于 nodeMode） */
  nodeId?: string;
  batchId?: string;
  /** v5.0：补偿重放沿用原触发方式，保持无人值守语义；缺省 manual */
  trigger?: FlowTrigger;
}

export interface FlowRunReplayService {
  replayOne(input: ReplayOneInput): { runId: string; parentRunId: string };
  replayBatch(input: FlowRunBatchReplayInput): FlowRunBatchReplayResult;
}

export function createFlowRunReplayService(deps: FlowRunReplayDeps): FlowRunReplayService {
  function replayOne(input: ReplayOneInput): { runId: string; parentRunId: string } {
    const parent = deps.runs.getRun(input.runId);
    if (!parent) throw ApiError.notFound('工作流运行', input.runId);
    const workflow = deps.workflows.getWorkflow(parent.workflowId);
    if (!workflow || workflow.status === 'disabled') {
      throw ApiError.conflict('工作流已停用，无法重放');
    }
    const mode = input.mode ?? 'snapshot';
    const nodeId = input.nodeId ?? resolveNodeId(parent, input.nodeMode ?? 'whole');

    const { graph, version } =
      mode === 'latest' ? loadLatest(parent, nodeId) : loadSnapshot(parent, nodeId);

    const newRunId = deps.flowRunner.createRunFromGraph({
      workflowId: parent.workflowId,
      graph,
      version,
      input: parent.input ?? {},
      trigger: input.trigger ?? 'manual',
      parentRunId: parent.id,
      resumedFromNode: nodeId,
      replayBatchId: input.batchId ?? null,
    });
    return { runId: newRunId, parentRunId: parent.id };
  }

  function resolveNodeId(parent: WorkflowRunView, nodeMode: FlowReplayNodeMode): string | null {
    if (nodeMode === 'whole') return null;
    const failed = deps.runs
      .listNodeExecutions(parent.id)
      .filter((node) => node.status === 'failed')
      .at(-1);
    return failed?.nodeId ?? null;
  }

  function loadSnapshot(parent: WorkflowRunView, nodeId: string | null) {
    const loaded = loadRunGraph({ run: parent, workflows: deps.workflows, runs: deps.runs });
    assertNodeExists(loaded.graph, nodeId);
    return { graph: loaded.graph, version: loaded.version };
  }

  function loadLatest(parent: WorkflowRunView, nodeId: string | null) {
    const current = deps.workflows.getProductionVersion(parent.workflowId);
    if (!current) throw ApiError.conflict('工作流没有可用的生产版本，无法按新版本重放');
    assertNodeExists(current.graph, nodeId);
    return { graph: current.graph, version: current.version };
  }

  function assertNodeExists(graph: { nodes: Array<{ id: string }> }, nodeId: string | null): void {
    if (!nodeId) return;
    if (graph.nodes.some((node) => node.id === nodeId)) return;
    throw ApiError.conflict(
      `节点 ${nodeId} 不在目标版本图中，无法从该节点重放 [flow/replay-node-missing]`,
    );
  }

  function replayBatch(input: FlowRunBatchReplayInput): FlowRunBatchReplayResult {
    const runIds = [...new Set(input.runIds)];
    if (runIds.length > 20) {
      throw ApiError.validation('批量重放一次最多 20 条 [flow/batch-limit-exceeded]');
    }
    const batchId = randomUUID();
    const results: FlowRunBatchReplayItem[] = [];
    const requested = runIds.length;
    let started = 0;
    let skipped = 0;
    let failed = 0;

    for (const runId of runIds) {
      const parent = deps.runs.getRun(runId);
      if (!parent) {
        results.push({ runId, ok: false, reason: 'not_found' });
        failed += 1;
        continue;
      }
      if (!FLOW_RUN_RESUMABLE_STATUSES.includes(parent.status)) {
        results.push({ runId, ok: false, reason: 'not_resumable' });
        skipped += 1;
        continue;
      }
      try {
        const replay = replayOne({
          runId,
          mode: input.mode ?? 'snapshot',
          nodeMode: input.nodeMode ?? 'failed_node',
          batchId,
        });
        results.push({ runId, ok: true, newRunId: replay.runId });
        started += 1;
      } catch (error) {
        results.push({ runId, ok: false, reason: errorMessage(error) });
        failed += 1;
      }
    }

    return { batchId, results, summary: { requested, started, skipped, failed } };
  }

  return { replayOne, replayBatch };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
