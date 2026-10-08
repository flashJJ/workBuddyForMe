import { FLOW_RUN_TERMINAL_STATUSES, type WorkflowRunView } from '@wbfm/shared/types';
import { ApiError } from '@wbfm/shared/errors';
import { type FlowHumanSubmitInput } from '@wbfm/shared/schemas';
import type { Tool } from '../tools/types';
import { createRetrievalService } from '../retrieval/retrieval-service';
import { compileFlow } from './compiler';
import { createFlowWaitRegistry } from './wait-registry';
import { buildFlowTool } from './flow-tool';
import { createChatInvoker } from './chat-invoke';
import { createFlowEventBus, type FlowEventBus } from './queue/event-bus';
import { createFlowRunQueue } from './queue/run-queue';
import { recoverInterruptedRuns } from './queue/recovery-scanner';
import { waitForRunTerminal } from './queue/terminal-wait';
import { createFlowExecutor, type FlowExecutor } from './flow-execution';
import { resolveRunRuntimeOverrides, type RunRuntimeOverrides } from './run-options';
import { streamRunEvents } from './run-event-stream';
import type { CreateRunParams, FlowRunService, FlowRunServiceDeps } from './run-service-types';

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
  const bus: FlowEventBus = createFlowEventBus();
  /** 运行期附加参数（策略快照/重放闭包，见 run-options.ts），执行结束即删除 */
  const runOverrides = new Map<string, RunRuntimeOverrides>();

  function loadCompiledGraph(workflowId: string, requirePublished: boolean) {
    const wf = workflows.getWorkflow(workflowId);
    if (!wf) throw ApiError.notFound('工作流不存在');
    if (requirePublished && wf.status !== 'published') {
      throw ApiError.validation('工作流尚未发布');
    }
    const versionView = workflows.getCurrentVersion(workflowId);
    if (!versionView) throw ApiError.validation('工作流还没有已保存的版本');
    const result = compileFlow(versionView.graph);
    if (!result.compiled) {
      const detail = result.diagnostics.map((d) => `[${d.severity}] ${d.message}`).join('；');
      throw ApiError.validation(`工作流图校验未通过：${detail}`);
    }
    return { version: versionView.version, compiled: result.compiled, graph: versionView.graph };
  }

  const executor: FlowExecutor = createFlowExecutor({
    deps,
    runtime,
    runs,
    waiters,
    retrieval,
    active,
  });

  /** 队列执行体：认领后的 run → 编译 → 执行 → 事件发布到总线 */
  async function runQueued(run: WorkflowRunView): Promise<void> {
    const { compiled } = loadCompiledGraph(run.workflowId, run.trigger !== 'manual');
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
    try {
      for await (const event of generator) bus.publish(run.id, event);
    } finally {
      runOverrides.delete(run.id);
    }
  }

  const queue = createFlowRunQueue({
    claim: (runId) => (runs.claimQueued(runId) ? runs.getRun(runId) : null),
    execute: runQueued,
    onError: (runId, error) => console.error(`[flow] run ${runId} 队列执行异常：`, error),
  });

  // 启动恢复：上一进程在途运行收敛 + queued 重新入队
  const recovery = recoverInterruptedRuns(runs, new Set(active.keys()));
  for (const runId of recovery.requeued) queue.enqueue(runId);

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
    const { version, compiled } = loadCompiledGraph(params.workflowId, trigger === 'chat');
    const overrides = resolveRunRuntimeOverrides({
      trigger,
      endpointId: params.endpointId,
      replay: params.replay,
      compiled,
      endpoints,
    });

    const run = runs.createRun({
      workflowId: params.workflowId,
      version,
      trigger,
      input: params.input ?? {},
      conversationId: params.conversationId ?? null,
      endpointId: params.endpointId ?? null,
      parentRunId: params.replay?.parentRunId ?? null,
      resumedFromNode: params.replay?.resumedFromNode ?? null,
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
    loadCompiledPublished: (workflowId) => loadCompiledGraph(workflowId, true),
    createChatRun: ({ workflowId, input }) => createRun({ workflowId, input, trigger: 'chat' }),
    executor,
    bus,
  });

  function resolveAsTool(workflowId: string): Tool | null {
    const wf = workflows.getWorkflow(workflowId);
    if (!wf || wf.status !== 'published') return null;
    const versionView = workflows.getCurrentVersion(workflowId);
    if (!versionView) return null;
    return buildFlowTool(wf, versionView.graph, { invokeFromChat });
  }

  return {
    createRun,
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
      return waiters.resolve(humanKey(runId, nodeId), decision);
    },
    submitToolConfirmation(runId, nodeId, allowed) {
      return waiters.resolve(toolKey(runId, nodeId), allowed);
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
    activeRunIds() {
      return [...active.keys()];
    },
    resolveAsTool,
    listPublishedTools() {
      return workflows
        .listWorkflows()
        .filter((wf) => wf.status === 'published')
        .map((wf) => resolveAsTool(wf.id))
        .filter((tool): tool is Tool => tool !== null);
    },
  };
}
