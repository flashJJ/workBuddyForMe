import type {
  AgentBudget,
  AgentRunView,
  ExecutorOutcome,
  ReviewVerdictPayload,
  SubtaskSpec,
} from '@wbfm/shared/schemas';
import type { AgentRunRepository } from '@wbfm/database';

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
      knowledgeBaseHint: { id: string | null; name: string } | null;
    },
    signal?: AbortSignal,
  ): Promise<{ subtask: SubtaskSpec; usage: RoleModelUsage }>;
}

export interface ReviewerClient {
  review(
    input: { goal: string; subtask: SubtaskSpec; outcome: ExecutorOutcome; round: number },
    signal?: AbortSignal,
  ): Promise<{ review: ReviewVerdictPayload; usage: RoleModelUsage }>;
}

export interface ExecutorClient {
  run(
    input: { goal: string; subtask: SubtaskSpec; round: number },
    signal?: AbortSignal,
  ): Promise<{ outcome: ExecutorOutcome; usage: RoleModelUsage; steps: number }>;
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
  knowledgeBaseHint?: { id: string | null; name: string } | null;
  signal?: AbortSignal;
}

export interface AgentRunnerDeps {
  repo: AgentRunRepository;
  clients: AgentClients;
}

export type { AgentRunView };
