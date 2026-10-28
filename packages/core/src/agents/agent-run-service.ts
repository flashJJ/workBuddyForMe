import { createAgentRunRepository, type DatabaseInstance } from '@wbfm/database';
import { ApiError } from '@wbfm/shared/errors';
import {
  AGENT_BUDGET_DEFAULTS,
  type AgentBudget,
  type AgentRunView,
} from '@wbfm/shared/schemas';
import type { AgentNodeInnerEvent } from '@wbfm/shared/types';
import { createAgentRunner } from './agent-runner';
import { createRunEventBus, tapRunEvents, type RunEventBus } from './run-event-bus';
import { createSignalTapBus } from './signal-tap';
import { PendingObserverRegistry } from './observer-registry';
import type { AgentClients, AgentRunEvent } from './index';
import type { AgentRoleKey } from './role-models';

/**
 * v1.4 协作运行管理服务：
 * 把 createAgentRunner 包装为可外部急停的服务，维护进程内
 * Map<runId, AbortController>；客户端断线 → clientSignal 联动 abort。
 * 角色客户端经 provider 端口解析（M2 注入真实模型与 executor 通道，
 * M3 Flow agent 节点经 startFlowNode 传入节点级覆盖）。
 *
 * v1.9 M2：每个活跃 run 挂只读事件总线，舞台作为第二客户端 observe() 续看，
 * 不拥有生命周期、断线不 abort（队列所有方在主会话）。
 */

interface ActiveEntry {
  abort: AbortController;
  bus: RunEventBus<AgentRunEvent>;
}

/** Flow/节点级覆盖：角色模型与知识库优先于助手配置 */
export interface AgentClientOverrides {
  roleModelIds?: Partial<Record<AgentRoleKey, string | null>>;
  knowledgeBaseIds?: string[] | null;
}

/** 角色客户端解析端口（按运行配置 + 可选节点覆盖解析三级模型回落与 executor 通道） */
export type AgentClientsProvider = (context: {
  run: AgentRunView;
  overrides?: AgentClientOverrides;
}) => Promise<AgentClients> | AgentClients;

/** 规划上下文端口（web 对话任务模式：由助手启用工具推导工具域、绑定知识库名提示） */
export type AgentPlanContextResolver = (run: AgentRunView) => {
  availableToolScopes: string[];
  knowledgeBaseHints: Array<{ id: string; name: string }>;
};

export interface AgentRunStartParams {
  /** 已由 POST /api/agent/runs 预建（status=running）的运行记录 */
  run: AgentRunView;
  /** 客户端请求信号（SSE 断线联动）；缺省仅服务自身 abort 控制 */
  clientSignal?: AbortSignal;
}

/** Flow agent 节点发起协作的入参（core 侧，与 flow/types 的 AgentCollabStartInput 同构） */
export interface FlowNodeStartParams {
  goal: string;
  assistantId: string | null;
  toolScopes: string[];
  budget: Partial<AgentBudget>;
  roleModelIds: {
    planner: string | null;
    executor: string | null;
    reviewer: string | null;
  };
  flowRunId: string;
  nodeExecutionId: string;
  /** 节点显式绑定的知识库（多库）；空数组=回落助手绑定 */
  knowledgeBaseIds: string[];
  signal?: AbortSignal;
}

export interface AgentRunService {
  /** 启动协作：解析客户端可能拒绝（ApiError→HTTP 响应）；成功返回事件生成器，重复/终态 409，无通道 501 */
  start(params: AgentRunStartParams): Promise<AsyncGenerator<AgentRunEvent>>;
  /**
   * v1.4 M3：Flow agent 节点入口——建行（回填 flow_run_id/node_execution_id）
   * 并按节点覆盖解析客户端。重跑节点即重新协作（不复制旧 run）。
   * 生成器返回值为终态 agent_run（引擎取 summary/status/rounds 输出引用）。
   */
  startFlowNode(
    params: FlowNodeStartParams,
  ): Promise<{ runId: string; events: AsyncGenerator<AgentNodeInnerEvent, AgentRunView> }>;
  /** 急停：活跃→abort；running 未订阅→直接收敛 cancelled；均返回 true；不存在 404；终态 409 */
  cancel(runId: string): boolean;
  /** 急停全部活跃协作（急停热键复用）；返回中断数量 */
  stopAll(): number;
  isActive(runId: string): boolean;
  activeRunIds(): string[];
  /**
   * v1.9 M2：只读观察订阅（舞台第二客户端）。活跃 run 返回事件迭代器
   * （自动回放本场已广播帧 + 后续帧），退订不影响 run；非活跃返回 null，
   * 调用方回落终态回放（已落库 handoffs + done）。
   */
  observe(runId: string): AsyncIterableIterator<AgentRunEvent> | null;
  /**
   * v1.9 M2：舞台先于 owner 开窗时的有界等待观察——run 已建行但 owner SSE
   * 未建连期间挂起，owner 一启动即原子挂到总线（不丢第一帧）；超时/取消回 null。
   */
  observeWhenReady(
    runId: string,
    waitMs: number,
  ): Promise<AsyncIterableIterator<AgentRunEvent> | null>;
  /** 是否已接通角色客户端通道 */
  hasClientsChannel(): boolean;
}

export interface AgentRunServiceDeps {
  db: DatabaseInstance;
  clientsProvider?: AgentClientsProvider;
  resolvePlanContext?: AgentPlanContextResolver;
  /** v2.7：工作信号回调（每帧广播前；不影响 owner/observer 语义） */
  onEvent?: (run: AgentRunView, event: AgentRunEvent) => void;
}

/** 包装生成器：消费结束（正常/abort/throw）即注销活跃注册 */
function withCleanup<T, R>(
  runId: string,
  active: Map<string, ActiveEntry>,
  gen: AsyncGenerator<T, R>,
): AsyncGenerator<T, R> {
  return (async function* () {
    try {
      return yield* gen;
    } finally {
      active.delete(runId);
    }
  })();
}

export function createAgentRunService(deps: AgentRunServiceDeps): AgentRunService {
  const repo = createAgentRunRepository(deps.db);
  const active = new Map<string, ActiveEntry>();
  /** 先开窗等 owner 的舞台观察者队列（原子挂接，不丢第一帧） */
  const pendingObservers = new PendingObserverRegistry<RunEventBus<AgentRunEvent>>();

  /** 解析客户端 + 信号合并的共用前置（失败回滚注册） */
  async function prepare(params: {
    run: AgentRunView;
    overrides?: AgentClientOverrides;
    clientSignal?: AbortSignal;
  }): Promise<{ signal: AbortSignal; clients: AgentClients; bus: RunEventBus<AgentRunEvent> }> {
    if (!deps.clientsProvider) {
      throw ApiError.notImplemented('多智能体协作通道未接通');
    }
    const abort = new AbortController();
    const bus = createRunEventBus<AgentRunEvent>();
    active.set(params.run.id, { abort, bus });
    // 总线一登记即唤醒等待中的舞台观察者（在客户端解析 await 之前，绝不漏帧）
    pendingObservers.publish(params.run.id, bus);
    let clients: AgentClients;
    try {
      clients = await deps.clientsProvider({ run: params.run, overrides: params.overrides });
    } catch (error) {
      const entry = active.get(params.run.id);
      entry?.bus.close();
      active.delete(params.run.id);
      pendingObservers.fail(params.run.id);
      throw error;
    }
    const signal = params.clientSignal
      ? AbortSignal.any([params.clientSignal, abort.signal])
      : abort.signal;
    return { signal, clients, bus };
  }

  /** 事件先广播给观察者再交 owner；终态关总线并注销活跃注册 */
  function own(
    run: AgentRunView,
    bus: RunEventBus<AgentRunEvent>,
    gen: AsyncGenerator<AgentRunEvent>,
  ) {
    const onEvent = deps.onEvent ? (event: AgentRunEvent) => deps.onEvent?.(run, event) : undefined;
    return withCleanup(run.id, active, tapRunEvents(createSignalTapBus(bus, onEvent), gen));
  }

  /** 组装 runner 并接上观察总线 + 注销清理 */
  function launch(
    run: AgentRunView,
    prepared: { signal: AbortSignal; clients: AgentClients; bus: RunEventBus<AgentRunEvent> },
    extra: { availableToolScopes?: string[]; knowledgeBaseHints?: { id: string; name: string }[] },
  ) {
    const gen = createAgentRunner({ repo, clients: prepared.clients }).run({
      runId: run.id,
      assistantId: run.assistantId,
      goal: run.goal,
      conversationId: run.conversationId,
      flowRunId: run.flowRunId,
      nodeExecutionId: run.nodeExecutionId,
      budget: run.budget,
      signal: prepared.signal,
      ...(extra.availableToolScopes ? { availableToolScopes: extra.availableToolScopes } : {}),
      ...(extra.knowledgeBaseHints ? { knowledgeBaseHints: extra.knowledgeBaseHints } : {}),
    });
    return own(run, prepared.bus, gen);
  }

  return {
    async start(params: AgentRunStartParams): Promise<AsyncGenerator<AgentRunEvent>> {
      const run = repo.getById(params.run.id);
      if (!run) throw ApiError.notFound('协作运行', params.run.id);
      if (active.has(run.id)) throw ApiError.conflict('协作事件流已被订阅，请勿重复打开');
      if (run.status !== 'running') {
        throw ApiError.conflict(`协作已终态（${run.status}），不能再次启动`);
      }
      const prepared = await prepare({ run, clientSignal: params.clientSignal });
      return launch(run, prepared, deps.resolvePlanContext?.(run) ?? {});
    },

    async startFlowNode(params) {
      if (!deps.clientsProvider) {
        throw ApiError.notImplemented('多智能体协作通道未接通（agent 节点不可用）');
      }
      const goal = params.goal.trim();
      if (!goal) throw ApiError.validation('协作（agent）节点目标不能为空');
      const run = repo.create({
        assistantId: params.assistantId ?? '',
        goal,
        conversationId: null,
        flowRunId: params.flowRunId,
        nodeExecutionId: params.nodeExecutionId,
        budget: { ...AGENT_BUDGET_DEFAULTS, ...params.budget },
      });
      const prepared = await prepare({
        run,
        overrides: { roleModelIds: params.roleModelIds, knowledgeBaseIds: params.knowledgeBaseIds },
        clientSignal: params.signal,
      });
      const events = launch(run, prepared, {
        availableToolScopes: params.toolScopes,
        knowledgeBaseHints: params.knowledgeBaseIds.map((id) => ({ id, name: id })),
      });
      return { runId: run.id, events };
    },

    cancel(runId) {
      const run = repo.getById(runId);
      if (!run) throw ApiError.notFound('协作运行', runId);
      const entry = active.get(runId);
      if (entry) {
        entry.abort.abort();
        return true;
      }
      if (run.status !== 'running') {
        throw ApiError.conflict(`协作已终态（${run.status}），无法取消`);
      }
      // running 但事件流尚未接通（急停早于 SSE 建连，生产模式常见竞态）：
      // 直接落 cancelled，避免运行永久孤儿；迟到的 GET /events 会因状态机拒绝启动
      repo.finalize(runId, {
        status: 'cancelled',
        errorCode: 'AGENT_CANCELLED',
        errorMessage: '用户取消',
      });
      // 唤醒等待开窗的舞台观察者，让其回落终态回放而非等满超时
      pendingObservers.fail(runId);
      return true;
    },

    stopAll() {
      const count = active.size;
      for (const entry of active.values()) entry.abort.abort();
      return count;
    },

    isActive(runId) {
      return active.has(runId);
    },

    activeRunIds() {
      return [...active.keys()];
    },

    observe(runId) {
      return active.get(runId)?.bus.subscribe() ?? null;
    },

    async observeWhenReady(runId, waitMs) {
      const bus = await pendingObservers.await(
        runId,
        waitMs,
        () => active.get(runId)?.bus,
      );
      return bus?.subscribe() ?? null;
    },

    hasClientsChannel() {
      return Boolean(deps.clientsProvider);
    },
  };
}
