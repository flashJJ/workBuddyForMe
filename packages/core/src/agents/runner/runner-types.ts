import type {
  AgentBudget,
  AgentPlanDecision,
  AgentRunView,
  ExecutorOutcome,
  ReviewVerdictPayload,
  SceneContextSnapshotPayload,
  SubtaskSpec,
} from '@wbfm/shared/schemas';
import type { AgentRunRepository, TaskRunCheckpointRepository } from '@wbfm/database';
import type { ExecutorGateFrame } from '../runtime/gate-mailbox';

/**
 * 三角色客户端端口（M1 定义、测试注入脚本化 mock；M2 接真实模型/task-loop）：
 * - PlannerClient：接 LLM（planner-protocol 解析在生产实现内完成）
 * - ReviewerClient：接 LLM（reviewer-protocol 解析在生产实现内完成）
 * - ExecutorClient：M2 实现为 task-loop/工具循环适配（screen/tool 两观察模式）
 */

export interface RoleModelUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface PlannerClient {
  plan(
    input: {
      goal: string;
      history: PlannerRoundHistory[];
      availableToolScopes: string[];
      /** 助手/节点绑定的全部知识库（planner 可在子任务单回填其中一个 id；空数组=无知识库） */
      knowledgeBaseHints: Array<{ id: string; name: string }>;
      /** v4.7：会话上下文块（近期对话/摘要/事实/记忆/计划） */
      contextBlock?: string;
    },
    signal?: AbortSignal,
  ): Promise<{ subtask: SubtaskSpec; usage: RoleModelUsage; contextStats?: SceneContextSnapshotPayload }>;
}

export interface ReviewerClient {
  review(
    input: { goal: string; subtask: SubtaskSpec; outcome: ExecutorOutcome; round: number },
    signal?: AbortSignal,
  ): Promise<{ review: ReviewVerdictPayload; usage: RoleModelUsage; contextStats?: SceneContextSnapshotPayload }>;
}

export interface ExecutorClient {
  run(
    input: {
      goal: string;
      subtask: SubtaskSpec;
      round: number;
      /**
       * v1.4 M4：task-loop 内 write/danger 工具门控帧出口。
       * runner 竞速消费并 yield 为 agent_tool_confirm SSE 帧（HITL）；
       * 决策由全局 confirmations 经 POST /api/tools/confirm 解决，执行侧自动放行/拒绝。
       */
      emitGateConfirm?: (frame: ExecutorGateFrame) => void;
      /** v4.7：会话上下文块（注入执行回合决策） */
      contextBlock?: string;
    },
    signal?: AbortSignal,
  ): Promise<{
    outcome: ExecutorOutcome;
    usage: RoleModelUsage;
    steps: number;
    contextStats?: SceneContextSnapshotPayload | null;
  }>;
}

export interface AgentClients {
  planner: PlannerClient;
  reviewer: ReviewerClient;
  executor: ExecutorClient;
}

/** 已完成轮次的历史（回传 planner 供返工时参考） */
export interface PlannerRoundHistory {
  round: number;
  subtask: SubtaskSpec;
  review: ReviewVerdictPayload;
}

export interface StartAgentRunInput {
  /** 预建运行 id（POST /api/agent/runs 先行建行，events 订阅时启动）；缺省由 runner 建行 */
  runId?: string;
  assistantId: string;
  goal: string;
  conversationId?: string | null;
  flowRunId?: string | null;
  nodeExecutionId?: string | null;
  budget?: Partial<AgentBudget>;
  /** 执行者可见工具域（助手配置/agent 节点传入） */
  availableToolScopes?: string[];
  /** 绑定知识库提示（助手/节点的多库集合；空数组=无知识库） */
  knowledgeBaseHints?: Array<{ id: string; name: string }>;
  /** v4.7：会话上下文块（由服务层按会话装配，注入 Planner 与 Executor） */
  contextBlock?: string;
  /** v4.7 P1：是否对复杂任务先出只读计划预览（全局开关） */
  planReview?: boolean;
  /** v4.7 P1：等待用户批准/拒绝计划；缺省视为批准（Flow/无人值守入口） */
  awaitPlanApproval?: (subtask: SubtaskSpec, round: number) => Promise<AgentPlanDecision['decision']>;
  signal?: AbortSignal;
}

export interface AgentRunnerDeps {
  repo: AgentRunRepository;
  clients: AgentClients;
  /** v4.7 P1：检查点仓储（缺省不落检查点，测试/Flow 可省略） */
  checkpoints?: TaskRunCheckpointRepository;
}

export type { AgentRunView };
