import type { DatabaseInstance } from '@wbfm/database';
import type { AgentBudget, AgentPlanDecision, AgentRunView } from '@wbfm/shared/schemas';
import type { AgentNodeInnerEvent } from '@wbfm/shared/types';
import type { AgentClients, AgentToolGate } from './runner-types';
import type { AgentRunEvent } from './agent-runner';
import type { AgentRoleKey } from '../clients/role-models';

/** v2.8：协作运行服务契约外迁（拆分守行数门禁） */

/** Flow/节点级覆盖：角色模型与知识库优先于助手配置 */
export interface AgentClientOverrides {
  roleModelIds?: Partial<Record<AgentRoleKey, string | null>>;
  knowledgeBaseIds?: string[] | null;
  /** v5.0：Flow 无人物工具门控（仅 agent 节点无人值守时注入） */
  toolGate?: AgentToolGate;
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

/**
 * v4.7 任务上下文端口：按会话装配近期对话/摘要/事实/记忆/计划，
 * 返回 null 表示无可用上下文（不注入）。实现方自行控制预算与失败降级。
 */
export type AgentTaskContextResolver = (run: AgentRunView) => Promise<string | null>;

export interface AgentRunStartParams {
  /** 已由 POST /api/agent/runs 预建（status=running）的运行记录 */
  run: AgentRunView;
  /** 客户端请求信号（SSE 断线联动）；缺省仅服务自身 abort 控制 */
  clientSignal?: AbortSignal;
}

/** v2.8：服务端持有启动（页面只观察，不再拥有生命周期） */
export interface AgentRunOwnedParams {
  run: AgentRunView;
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
  /** v5.0：流程级无人值守工具门控 */
  toolGate?: AgentToolGate;
  signal?: AbortSignal;
}

export interface AgentRunService {
  /** 启动协作：解析客户端可能拒绝（ApiError→HTTP 响应）；成功返回事件生成器，重复/终态 409，无通道 501 */
  start(params: AgentRunStartParams): Promise<AsyncGenerator<AgentRunEvent>>;
  /**
   * v2.8：服务端持有启动——后台消费运行，返回观察迭代器（含本场回放）。
   * 同一 runId 已活跃时直接返回观察迭代器（不重复启动、不抛 409）；
   * 客户端断开不 abort。无通道 501，终态/不存在 409/404。
   */
  startOwned(params: AgentRunOwnedParams): Promise<AsyncIterableIterator<AgentRunEvent>>;
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
  /** v4.7 P1：提交计划决策（批准/拒绝）；无待确认计划 409，不存在 404 */
  resolvePlan(runId: string, decision: AgentPlanDecision): boolean;
  /**
   * v4.7 P1：从可续跑检查点续跑——新建 run（沿用目标/会话，预算取剩余），
   * 服务端持有执行；返回新 run。源 run 非中断收敛/无检查点：409。
   */
  resume(runId: string): Promise<AgentRunView>;
  /** 急停全部活跃协作（急停热键复用）；返回中断数量 */
  stopAll(): number;
  isActive(runId: string): boolean;
  activeRunIds(): string[];
  /**
   * v1.9 M2：只读观察订阅（舞台第二客户端）。活跃 run 返回事件迭代器
   * （自动回放本场已广播帧 + 后续帧），退订不影响 run；非活跃返回 null，
   * 调用方回落终态回放（已落库 handoffs + done）。
   */
  observe(runId: string, sinceSeq?: number): AsyncIterableIterator<AgentRunEvent> | null;
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
  /** v4.7：会话上下文装配端口（对话任务模式注入 Planner/Executor） */
  resolveTaskContext?: AgentTaskContextResolver;
  /** v4.7 P1：计划确认全局开关（缺省 true；仅对 needsPlanReview 的复杂任务生效） */
  planReviewEnabled?: (run: AgentRunView) => boolean;
  /** v2.7：工作信号回调（每帧广播前；不影响 owner/observer 语义） */
  onEvent?: (run: AgentRunView, event: AgentRunEvent) => void;
  /** v2.8：终态回调（完成回投；服务端持有时只调用一次） */
  onComplete?: (run: AgentRunView) => void;
  /** v2.8：作业租约持有者 id */
  ownerId?: string;
}
