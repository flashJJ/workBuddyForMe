import {
  ApiError,
  FLOW_RUN_TERMINAL_STATUSES,
  type FlowEventPayload,
  type FlowHumanSubmitInput,
  type FlowTrigger,
  type ToolSubstep,
  type WorkflowRunView,
} from '@wbfm/shared';
import type {
  WorkflowEndpointRepository,
  WorkflowRepository,
  WorkflowRunRepository,
} from '@wbfm/database';
import type { ServiceDeps } from '../services/deps';
import type { ToolRuntime } from '../tools/tool-runtime';
import type { Tool } from '../tools/types';
import { createRetrievalService } from '../retrieval/retrieval-service';
import { compileFlow } from './compiler';
import { createFlowWaitRegistry, type FlowWaitRegistry } from './wait-registry';
import { buildFlowTool } from './flow-tool';
import { createSubstepQueue } from '../chat/substep-queue';
import { createChatInvoker } from './chat-invoke';
import { createFlowEventBus, isTerminalFlowEvent, type FlowEventBus } from './queue/event-bus';
import { createFlowRunQueue } from './queue/run-queue';
import { recoverInterruptedRuns } from './queue/recovery-scanner';
import { waitForRunTerminal } from './queue/terminal-wait';
import { createFlowExecutor, type FlowExecutor } from './flow-execution';
import { resolveRunRuntimeOverrides, type RunRuntimeOverrides } from './run-options';

interface ActiveEntry {
  abort: AbortController;
}

export interface FlowRunServiceDeps {
  deps: ServiceDeps;
  runtime: ToolRuntime;
  workflows: WorkflowRepository;
  runs: WorkflowRunRepository;
  waiters?: FlowWaitRegistry;
  /** v0.9：读取端点策略快照（api/mcp 运行门控）；内部路由/测试可不传 */
  endpoints?: WorkflowEndpointRepository;
}

export interface CreateRunParams {
  workflowId: string;
  input?: Record<string, unknown>;
  trigger?: FlowTrigger;
  conversationId?: string | null;
  endpointId?: string | null;
  /** v0.9 重放：关联原运行；resumedFromNode 存在时为祖先闭包节点重放，否则整体重跑 */
  replay?: { parentRunId: string; resumedFromNode?: string };
}

export interface FlowRunService {
  /** 登记 queued 运行（校验图 + 建记录）；manual/api/mcp 自动入队，chat 由 invokeFromChat 直接执行 */
  createRun(params: CreateRunParams): string;
  /** 显式入队（恢复扫描等内部场景；重复调用幂等） */
  enqueueRun(runId: string): void;
  /**
   * 只读订阅运行事件（不影响执行生命周期）：
   * 本进程有事件缓冲（进行中或刚终态）→ 返回生成器（先补历史再接实时）；
   * 进程重启后的终态运行无缓冲 → 返回 null，调用方改从 node_executions 回放。
   */
  subscribeRunEvents(runId: string, observerSignal?: AbortSignal):
    | AsyncGenerator<FlowEventPayload>
    | null;
  /**
   * 等待运行进入终态（公开 API 同步调用 / MCP tools/call 复用）：
   * 纯等待者，不占用队列执行者，也不影响运行生命周期。
   * 超时返回 timedOut（运行继续，调用方转异步语义）。
   */
  waitForTerminal(
    runId: string,
    timeoutMs: number,
  ): Promise<{ timedOut: boolean; run: WorkflowRunView | null }>;
  submitHuman(runId: string, nodeId: string, body: FlowHumanSubmitInput): boolean;
  submitToolConfirmation(runId: string, nodeId: string, allowed: boolean): boolean;
  cancel(runId: string): boolean;
  isActive(runId: string): boolean;
  activeRunIds(): string[];
  resolveAsTool(workflowId: string): Tool | null;
  listPublishedTools(): Tool[];
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

  /** 订阅生成器：先同步补发缓冲，再接实时，终态事件后自动结束 */
  async function* eventGenerator(
    runId: string,
    catchup: FlowEventPayload[],
    observerSignal?: AbortSignal,
  ): AsyncGenerator<FlowEventPayload> {
    const q = createSubstepQueue<FlowEventPayload>();
    for (const event of catchup) q.push(event);
    const unsubscribe = bus.subscribe(runId, (event) => q.push(event));
    observerSignal?.addEventListener('abort', () => q.close(), { once: true });
    try {
      for (;;) {
        const item = await q.next();
        if (item.done) break;
        yield item.value;
        if (isTerminalFlowEvent(item.value)) {
          q.close();
          break;
        }
      }
    } finally {
      unsubscribe();
    }
  }

  function subscribeRunEvents(runId: string, observerSignal?: AbortSignal) {
    const run = runs.getRun(runId);
    if (!run) throw ApiError.notFound('工作流运行', runId);
    const buffered = bus.snapshot(runId);
    // 终态且本进程无缓冲（重启前的运行）→ 交调用方走落库回放
    if (buffered === null && FLOW_RUN_TERMINAL_STATUSES.includes(run.status)) return null;
    return eventGenerator(runId, buffered ?? [], observerSignal);
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
