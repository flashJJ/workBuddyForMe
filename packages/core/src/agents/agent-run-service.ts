import { createAgentRunRepository, type DatabaseInstance } from '@wbfm/database';
import { ApiError } from '@wbfm/shared/errors';
import type { AgentRunView } from '@wbfm/shared/schemas';
import { createAgentRunner } from './agent-runner';
import type { AgentClients, AgentRunEvent } from './index';

/**
 * v1.4 M1 协作运行管理服务：
 * 把 createAgentRunner 包装为可外部急停的服务，维护进程内
 * Map<runId, AbortController>；客户端断线 → clientSignal 联动 abort。
 * 角色客户端经 provider 端口解析——M1 骨架期 web 容器不接（start 抛 501），
 * M2 注入真实 planner/reviewer 模型与 executor 适配器。
 */

interface ActiveEntry {
  abort: AbortController;
}

/** 角色客户端解析端口（M2 实现：按运行配置解析三级模型回落 + executor 通道） */
export type AgentClientsProvider = (context: {
  run: AgentRunView;
}) => Promise<AgentClients> | AgentClients;

/** 规划上下文端口（M2 web 实现：由助手启用工具推导工具域、绑定知识库名提示） */
export type AgentPlanContextResolver = (run: AgentRunView) => {
  availableToolScopes: string[];
  knowledgeBaseHint: { id: string | null; name: string } | null;
};

export interface AgentRunStartParams {
  /** 已由 POST /api/agent/runs 预建（status=running）的运行记录 */
  run: AgentRunView;
  /** 客户端请求信号（SSE 断线联动）；缺省仅服务自身 abort 控制 */
  clientSignal?: AbortSignal;
}

export interface AgentRunService {
  /** 启动协作：解析客户端可能拒绝（ApiError→HTTP 响应）；成功返回事件生成器，重复/终态 409，无通道 501 */
  start(params: AgentRunStartParams): Promise<AsyncGenerator<AgentRunEvent>>;
  /** 急停：活跃→abort 返回 true；未启动返回 false；不存在 404；终态 409 */
  cancel(runId: string): boolean;
  /** 急停全部活跃协作（急停热键复用）；返回中断数量 */
  stopAll(): number;
  isActive(runId: string): boolean;
  activeRunIds(): string[];
  /** M1 骨架期是否已接通角色客户端通道 */
  hasClientsChannel(): boolean;
}

export interface AgentRunServiceDeps {
  db: DatabaseInstance;
  clientsProvider?: AgentClientsProvider;
  resolvePlanContext?: AgentPlanContextResolver;
}

export function createAgentRunService(deps: AgentRunServiceDeps): AgentRunService {
  const repo = createAgentRunRepository(deps.db);
  const active = new Map<string, ActiveEntry>();

  return {
  /**
   * 启动协作：异步解析角色客户端后返回事件生成器（消费完自动注销）。
   * 模型/配置错误（ApiError）在 await 阶段抛出，由路由转成对应 HTTP 响应；
   * 重复/终态启动 409，无通道 501。
   */
  async start(params: AgentRunStartParams): Promise<AsyncGenerator<AgentRunEvent>> {
    const run = repo.getById(params.run.id);
    if (!run) throw ApiError.notFound('协作运行', params.run.id);
    if (active.has(run.id)) throw ApiError.conflict('协作事件流已被订阅，请勿重复打开');
    if (run.status !== 'running') {
      throw ApiError.conflict(`协作已终态（${run.status}），不能再次启动`);
    }
    if (!deps.clientsProvider) {
      throw ApiError.notImplemented('多智能体协作通道将在后续版本接通（当前为骨架期）');
    }
    const abort = new AbortController();
    // 先占注册：并发订阅在 provider 解析期也会命中 409
    active.set(run.id, { abort });
    let clients: AgentClients;
    try {
      clients = await deps.clientsProvider({ run });
    } catch (error) {
      active.delete(run.id);
      throw error;
    }
    const signal = params.clientSignal
      ? AbortSignal.any([params.clientSignal, abort.signal])
      : abort.signal;
    const planContext = deps.resolvePlanContext?.(run);
    return (async function* () {
      try {
        const gen = createAgentRunner({ repo, clients }).run({
          runId: run.id,
          assistantId: run.assistantId,
          goal: run.goal,
          conversationId: run.conversationId,
          flowRunId: run.flowRunId,
          nodeExecutionId: run.nodeExecutionId,
          budget: run.budget,
          signal,
          ...(planContext
            ? {
                availableToolScopes: planContext.availableToolScopes,
                knowledgeBaseHint: planContext.knowledgeBaseHint,
              }
            : {}),
        });
        return yield* gen;
      } finally {
        active.delete(run.id);
      }
    })();
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
      return false;
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

    hasClientsChannel() {
      return Boolean(deps.clientsProvider);
    },
  };
}
