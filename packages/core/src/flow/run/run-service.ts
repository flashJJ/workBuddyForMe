import { FLOW_RUN_TERMINAL_STATUSES, type WorkflowRunView } from '@wbfm/shared/types';
import { ApiError } from '@wbfm/shared/errors';
import { type FlowHumanSubmitInput } from '@wbfm/shared/schemas';
import type { Tool } from '../../tools/types';
import { createRetrievalService } from '../../retrieval/retrieval-service';
import { createFlowWaitRegistry } from './wait-registry';
import { buildFlowTool } from '../invoke/flow-tool';
import { createChatInvoker } from '../invoke/chat-invoke';
import { createFlowEventBus, type FlowEventBus } from '../queue/event-bus';
import { createFlowRunQueue } from '../queue/run-queue';
import { waitForRunTerminal } from '../queue/terminal-wait';
import { createFlowExecutor, type FlowExecutor } from './flow-execution';
import { resolveRunRuntimeOverrides, type RunRuntimeOverrides } from './run-options';
import { recoverFlowRuns } from './run-recovery';
import { streamRunEvents } from './run-event-stream';
import { compileGraph, loadCompiledGraph } from './run-graph-loader';
import { loadRunGraph, serializeRunGraph } from '../reliability/run-snapshot';
import type {
  CreateRunFromGraphParams,
  CreateRunParams,
  FlowRunService,
  FlowRunServiceDeps,
} from './run-service-types';

export type { CreateRunParams, FlowRunService, FlowRunServiceDeps } from './run-service-types';

interface ActiveEntry {
  abort: AbortController;
}

const humanKey = (runId: string, nodeId: string) => `${runId}:human:${nodeId}`;
const toolKey = (runId: string, nodeId: string) => `${runId}:tool:${nodeId}`;
/** queued 补偿扫描周期：5 秒（本地应用，最长冷启动认领延迟上限） */
const RESCUE_INTERVAL_MS = 5_000;

export function createFlowRunService(serviceDeps: FlowRunServiceDeps): FlowRunService {
  const { deps, runtime, workflows, runs } = serviceDeps;
  const endpoints = serviceDeps.endpoints;
  const waiters = serviceDeps.waiters ?? createFlowWaitRegistry();
  const retrieval = createRetrievalService(deps);
  const active = new Map<string, ActiveEntry>();
  const rawBus: FlowEventBus = createFlowEventBus();
  // v2.7：所有写入总线的帧（队列执行 + chat 触发）都同步给工作信号 hub；
  // 观察者与执行生命周期不受影响。
  const bus: FlowEventBus = {
    ...rawBus,
    publish(runId, event) {
      rawBus.publish(runId, event);
      if (!serviceDeps.onEvent) return;
      try {
        const run = runs.getRun(runId);
        if (!run) return;
        const title = workflows.getWorkflow(run.workflowId)?.name ?? '工作流';
        serviceDeps.onEvent(run, event, title);
      } catch (error) {
        console.warn('[flow] 工作信号摄取失败：', error);
      }
    },
  };
  /** 运行期附加参数（策略快照/重放闭包，见 run-options.ts），执行结束即删除 */
  const runOverrides = new Map<string, RunRuntimeOverrides>();

  function loadCompiledFor(workflowId: string, requirePublished: boolean) {
    return loadCompiledGraph(workflows, workflowId, requirePublished);
  }

  const executor: FlowExecutor = createFlowExecutor({
    deps,
    runtime,
    runs,
    waiters,
    retrieval,
    active,
    ...(serviceDeps.agentRuns ? { agentRuns: serviceDeps.agentRuns } : {}),
  });

  /** 队列执行体：认领后的 run → 载图（快照优先）→ 编译 → 执行 → 事件发布到总线 */
  async function runQueued(run: WorkflowRunView): Promise<void> {
    try {
      const loaded = loadRunGraph({ run, workflows, runs });
      const compiled = compileGraph(loaded.graph);
      const overrides = runOverrides.get(run.id);
      const generator = executor.execute(compiled, {
        runId: run.id,
        workflowId: run.workflowId,
        version: run.version,
        input: run.input ?? {},
        trigger: run.trigger,
        interactive: run.trigger === 'manual',
        ...(overrides ?? {}),
      });
      for await (const event of generator) bus.publish(run.id, event);
    } catch (error) {
      // 编译/执行体异常必须收敛终态：认领时 DB 已置 running，
      // 不落终态会让运行永久停在 running（只能靠重启恢复扫描）。
      const message = error instanceof Error ? error.message : String(error);
      const graphUnavailable = message.includes('flow/run-graph-unavailable');
      try {
        runs.finishRun(run.id, graphUnavailable ? 'interrupted' : 'failed', {
          error: {
            code: graphUnavailable ? 'flow/run-graph-unavailable' : 'flow/run-failed',
            message,
          },
        });
        bus.publish(run.id, {
          type: 'run_failed',
          runId: run.id,
          workflowId: run.workflowId,
          message,
        });
      } catch {
        /* 兜底落账/发布失败：不让队列 tick 变成未处理拒绝 */
      }
      throw error;
    } finally {
      runOverrides.delete(run.id);
      // 终态后回收事件缓冲：否则本进程每跑一次流程就永久保留一份事件数组
      bus.dispose(run.id);
    }
  }

  const queue = createFlowRunQueue({
    claim: (runId) => (runs.claimQueued(runId) ? runs.getRun(runId) : null),
    execute: runQueued,
    onError: (runId, error) => console.error(`[flow] run ${runId} 队列执行异常：`, error),
  });

  // v4.23 启动恢复：queued 重新入队；在途运行按安全矩阵续跑或保持 interrupted
  const startupActiveIds = new Set(active.keys());
  const recovery = recoverFlowRuns({
    workflows,
    runs,
    endpoints,
    startupActiveIds,
    resolveTool: (name) => runtime.resolveTool(name)?.tool ?? null,
    onResumed: (runId, overrides) => runOverrides.set(runId, overrides),
  });
  for (const runId of [...recovery.requeued, ...recovery.resumed]) queue.enqueue(runId);

  // 定时补偿：纯 setImmediate 边缘触发在极端时序（如 dev 冷编译窗口模块重载）
  // 下可能丢失首个信号；周期把 DB 中仍是 queued 且本进程未在执行的 run 重新入队。
  // claim 以 DB 原子更新兜底，补偿永远不会导致双跑。
  const rescueTimer = setInterval(() => {
    try {
      for (const run of runs.listRuns({ status: 'queued', limit: 100 })) {
        if (!queue.hasInFlight(run.id)) queue.enqueue(run.id);
      }
    } catch (error) {
      console.error('[flow] queued 补偿扫描失败：', error);
    }
  }, RESCUE_INTERVAL_MS);
  rescueTimer.unref?.();

  function createRun(params: CreateRunParams): string {
    const trigger = params.trigger ?? 'manual';
    if (params.replay) {
      const parent = runs.getRun(params.replay.parentRunId);
      if (!parent) throw ApiError.notFound('工作流运行', params.replay.parentRunId);
      const loaded = loadRunGraph({ run: parent, workflows, runs });
      return createRunFromGraph({
        ...params,
        graph: loaded.graph,
        version: loaded.version,
        parentRunId: parent.id,
        resumedFromNode: params.replay.resumedFromNode ?? null,
      });
    }
    const { version, graph } = loadCompiledFor(params.workflowId, trigger === 'chat');
    return createRunFromGraph({ ...params, graph, version });
  }

  function createRunFromGraph(params: CreateRunFromGraphParams): string {
    const trigger = params.trigger ?? 'manual';
    const compiled = compileGraph(params.graph);
    const overrides = resolveRunRuntimeOverrides({
      trigger,
      endpointId: params.endpointId,
      replay: params.parentRunId
        ? {
            parentRunId: params.parentRunId,
            ...(params.resumedFromNode ? { resumedFromNode: params.resumedFromNode } : {}),
          }
        : undefined,
      compiled,
      endpoints,
    });
    const snapshot = serializeRunGraph(params.graph);

    const run = runs.createRun({
      workflowId: params.workflowId,
      version: params.version,
      trigger,
      input: params.input ?? {},
      conversationId: params.conversationId ?? null,
      endpointId: params.endpointId ?? null,
      parentRunId: params.parentRunId ?? null,
      resumedFromNode: params.resumedFromNode ?? null,
      replayBatchId: params.replayBatchId ?? null,
      graphSnapshotJson: snapshot.json,
      graphHash: snapshot.hash,
    });
    runOverrides.set(run.id, overrides);
    // chat 路径由 invokeFromChat 在调用协程内直接执行；其余触发器入队
    if (trigger !== 'chat') queue.enqueue(run.id);
    return run.id;
  }

  function subscribeRunEvents(runId: string, observerSignal?: AbortSignal) {
    const run = runs.getRun(runId);
    if (!run) throw ApiError.notFound('工作流运行', runId);
    const buffered = bus.snapshot(runId);
    // 终态且本进程无缓冲（重启前的运行）→ 交调用方走落库回放
    if (buffered === null && FLOW_RUN_TERMINAL_STATUSES.includes(run.status)) return null;
    return streamRunEvents(bus, runId, buffered ?? [], observerSignal);
  }

  const invokeFromChat = createChatInvoker({
    // 对话要求已发布；createRun 内部仍会再次校验
    loadCompiledPublished: (workflowId) => loadCompiledFor(workflowId, true),
    createChatRun: ({ workflowId, input }) => createRun({ workflowId, input, trigger: 'chat' }),
    executor,
    bus,
    // chat 路径不经队列：override 必须在此回收，否则按调用次数无界累积
    releaseRun: (runId) => {
      runOverrides.delete(runId);
    },
  });

  function resolveAsTool(workflowId: string): Tool | null {
    const wf = workflows.getWorkflow(workflowId);
    if (!wf || wf.status === 'disabled') return null;
    if (wf.publishedVersion === null && wf.status !== 'published') return null;
    const versionView = workflows.getProductionVersion(workflowId);
    if (!versionView) return null;
    return buildFlowTool(wf, versionView.graph, { invokeFromChat });
  }

  return {
    createRun,
    createRunFromGraph,
    enqueueRun: (runId) => queue.enqueue(runId),
    subscribeRunEvents,
    waitForTerminal: (runId, timeoutMs) =>
      waitForRunTerminal({ bus, getRun: runs.getRun.bind(runs) }, runId, timeoutMs),
    submitHuman(runId, nodeId, body) {
      const decision: FlowHumanSubmitInput = {
        nodeId: body.nodeId ?? nodeId,
        approved: body.approved,
        values: body.values ?? {},
      };
      const resolved = waiters.resolve(humanKey(runId, nodeId), decision);
      // v4.24 修复：批准即恢复执行，状态先回 running；否则审批后写操作在途崩溃会被误判为纯等待
      if (resolved) runs.clearWaitingHuman(runId, nodeId);
      return resolved;
    },
    submitToolConfirmation(runId, nodeId, allowed) {
      const resolved = waiters.resolve(toolKey(runId, nodeId), allowed);
      if (resolved) runs.clearWaitingHuman(runId, nodeId);
      return resolved;
    },
    cancel(runId) {
      const entry = active.get(runId);
      if (!entry) return false;
      entry.abort.abort();
      return true;
    },
    isActive(runId) {
      return active.has(runId);
    },
    /** 容器重装（E2E 恢复出厂）时停补偿定时器：闭包持有旧库，关闭后会持续报错 */
    dispose() {
      clearInterval(rescueTimer);
    },
    activeRunIds() {
      return [...active.keys()];
    },
    resolveAsTool,
    listPublishedTools() {
      return workflows
        .listWorkflows()
        .filter((wf) => wf.status !== 'disabled' && (wf.publishedVersion !== null || wf.status === 'published'))
        .map((wf) => resolveAsTool(wf.id))
        .filter((tool): tool is Tool => tool !== null);
    },
  };
}
