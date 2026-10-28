import { createAgentRunRepository } from '@wbfm/database';
import { ApiError } from '@wbfm/shared/errors';
import { AGENT_BUDGET_DEFAULTS, type AgentRunView } from '@wbfm/shared/schemas';
import { createAgentRunner } from './agent-runner';
import { createRunEventBus, tapRunEvents, type RunEventBus } from './run-event-bus';
import { createSignalTapBus } from './signal-tap';
import { PendingObserverRegistry } from './observer-registry';
import type { AgentClients, AgentRunEvent } from './index';
import type {
  AgentClientOverrides,
  AgentRunService,
  AgentRunServiceDeps,
  AgentRunStartParams,
} from './agent-run-service-types';

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

export type {
  AgentClientOverrides,
  AgentClientsProvider,
  AgentPlanContextResolver,
  AgentRunOwnedParams,
  AgentRunService,
  AgentRunServiceDeps,
  AgentRunStartParams,
  FlowNodeStartParams,
} from './agent-run-service-types';

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

    async startOwned(params) {
      const existing = active.get(params.run.id);
      if (existing) return existing.bus.subscribe();
      const run = repo.getById(params.run.id);
      if (!run) throw ApiError.notFound('协作运行', params.run.id);
      if (run.status !== 'running') {
        throw ApiError.conflict(`协作已终态（${run.status}），不能再次启动`);
      }
      const prepared = await prepare({ run });
      repo.setLease(
        run.id,
        deps.ownerId ?? 'process',
        new Date(Date.now() + 90_000).toISOString(),
      );
      const gen = launch(run, prepared, deps.resolvePlanContext?.(run) ?? {});
      void (async () => {
        try {
          for await (const _event of gen) {
            /* 服务端持有消费；观察者经总线接收 */
          }
        } catch {
          const latest = repo.getById(run.id);
          if (latest && latest.status === 'running') {
            try {
              repo.finalize(run.id, {
                status: 'failed',
                errorCode: 'AGENT_FAILED',
                errorMessage: '协作运行异常终止',
              });
            } catch {
              /* 已被取消/终态，忽略 */
            }
          }
        } finally {
          repo.clearLease(run.id);
          const latest = repo.getById(run.id);
          if (latest) deps.onComplete?.(latest);
        }
      })();
      return prepared.bus.subscribe();
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

    observe(runId, sinceSeq) {
      const entry = active.get(runId);
      if (!entry) return null;
      return sinceSeq && sinceSeq > 1 ? entry.bus.subscribeFrom(sinceSeq) : entry.bus.subscribe();
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
