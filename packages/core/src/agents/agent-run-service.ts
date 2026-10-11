import { createAgentRunRepository, type DatabaseInstance } from '@wbfm/database';
import { ApiError } from '@wbfm/shared/errors';
import {
  AGENT_BUDGET_DEFAULTS,
  type AgentBudget,
  type AgentRunView,
} from '@wbfm/shared/schemas';
import type { AgentNodeInnerEvent } from '@wbfm/shared/types';
import { createAgentRunner } from './agent-runner';
import type { AgentClients, AgentRunEvent } from './index';
import type { AgentRoleKey } from './role-models';

/**
 * v1.4 协作运行管理服务：
 * 把 createAgentRunner 包装为可外部急停的服务，维护进程内
 * Map<runId, AbortController>；客户端断线 → clientSignal 联动 abort。
 * 角色客户端经 provider 端口解析（M2 注入真实模型与 executor 通道，
 * M3 Flow agent 节点经 startFlowNode 传入节点级覆盖）。
 */

interface ActiveEntry {
  abort: AbortController;
}

/** Flow/节点级覆盖：角色模型与知识库优先于助手配置 */
export interface AgentClientOverrides {
  roleModelIds?: Partial<Record<AgentRoleKey, string | null>>;
  knowledgeBaseId?: string | null;
}

/** 角色客户端解析端口（按运行配置 + 可选节点覆盖解析三级模型回落与 executor 通道） */
export type AgentClientsProvider = (context: {
  run: AgentRunView;
  overrides?: AgentClientOverrides;
}) => Promise<AgentClients> | AgentClients;

/** 规划上下文端口（web 对话任务模式：由助手启用工具推导工具域、绑定知识库名提示） */
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

/** Flow agent 节点发起协作的入参（core 侧，与 flow/types 的 AgentCollabStartInput 同构） */
export interface FlowNodeStartParams {
  goal: string;
  assistantId: string | null;
  knowledgeBaseId: string | null;
  toolScopes: string[];
  budget: Partial<AgentBudget>;
  roleModelIds: {
    planner: string | null;
    executor: string | null;
    reviewer: string | null;
  };
  flowRunId: string;
  nodeExecutionId: string;
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
  /** 急停：活跃→abort 返回 true；未启动返回 false；不存在 404；终态 409 */
  cancel(runId: string): boolean;
  /** 急停全部活跃协作（急停热键复用）；返回中断数量 */
  stopAll(): number;
  isActive(runId: string): boolean;
  activeRunIds(): string[];
  /** 是否已接通角色客户端通道 */
  hasClientsChannel(): boolean;
}

export interface AgentRunServiceDeps {
  db: DatabaseInstance;
  clientsProvider?: AgentClientsProvider;
  resolvePlanContext?: AgentPlanContextResolver;
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

  /** 解析客户端 + 信号合并的共用前置（失败回滚注册） */
  async function prepare(params: {
    run: AgentRunView;
    overrides?: AgentClientOverrides;
    clientSignal?: AbortSignal;
  }): Promise<{ signal: AbortSignal; clients: AgentClients }> {
    if (!deps.clientsProvider) {
      throw ApiError.notImplemented('多智能体协作通道未接通');
    }
    const abort = new AbortController();
    active.set(params.run.id, { abort });
    let clients: AgentClients;
    try {
      clients = await deps.clientsProvider({ run: params.run, overrides: params.overrides });
    } catch (error) {
      active.delete(params.run.id);
      throw error;
    }
    const signal = params.clientSignal
      ? AbortSignal.any([params.clientSignal, abort.signal])
      : abort.signal;
    return { signal, clients };
  }

  return {
    async start(params: AgentRunStartParams): Promise<AsyncGenerator<AgentRunEvent>> {
      const run = repo.getById(params.run.id);
      if (!run) throw ApiError.notFound('协作运行', params.run.id);
      if (active.has(run.id)) throw ApiError.conflict('协作事件流已被订阅，请勿重复打开');
      if (run.status !== 'running') {
        throw ApiError.conflict(`协作已终态（${run.status}），不能再次启动`);
      }
      const { signal, clients } = await prepare({ run, clientSignal: params.clientSignal });
      const planContext = deps.resolvePlanContext?.(run);
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
      return withCleanup(run.id, active, gen);
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
      const overrides: AgentClientOverrides = {
        roleModelIds: params.roleModelIds,
        knowledgeBaseId: params.knowledgeBaseId,
      };
      const { signal, clients } = await prepare({ run, overrides, clientSignal: params.signal });
      const gen = createAgentRunner({ repo, clients }).run({
        runId: run.id,
        assistantId: run.assistantId,
        goal,
        conversationId: null,
        flowRunId: params.flowRunId,
        nodeExecutionId: params.nodeExecutionId,
        budget: run.budget,
        signal,
        availableToolScopes: params.toolScopes,
        knowledgeBaseHint: params.knowledgeBaseId
          ? { id: params.knowledgeBaseId, name: params.knowledgeBaseId }
          : null,
      });
      return { runId: run.id, events: withCleanup(run.id, active, gen) };
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
