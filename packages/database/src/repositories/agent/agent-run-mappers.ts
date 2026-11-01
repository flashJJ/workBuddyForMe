import type {
  AgentHandoffPayload,
  AgentHandoffView,
  AgentRole,
  AgentRunStatus,
  AgentRunView,
  ExecutorOutcome,
} from '@wbfm/shared/schemas';

/**
 * v1.4 agent_runs/agent_handoffs 表行列镜像与视图映射（M1）。
 * 行类型不导出仓储外；列名改动只需同步本文件与 v019 迁移。
 */

export interface AgentRunRow {
  id: string;
  conversation_id: string | null;
  flow_run_id: string | null;
  node_execution_id: string | null;
  assistant_id: string;
  goal: string;
  status: string;
  round_no: number;
  max_rounds: number;
  max_steps: number;
  max_total_tokens: number;
  final_outcome: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentHandoffRow {
  id: string;
  run_id: string;
  round_no: number;
  seq: number;
  from_role: string;
  to_role: string;
  payload: string;
  created_at: string;
}

export function mapAgentRun(row: AgentRunRow): AgentRunView {
  let finalOutcome: ExecutorOutcome | null = null;
  if (row.final_outcome) {
    try {
      finalOutcome = JSON.parse(row.final_outcome) as ExecutorOutcome;
    } catch {
      finalOutcome = null;
    }
  }
  return {
    id: row.id,
    conversationId: row.conversation_id,
    flowRunId: row.flow_run_id,
    nodeExecutionId: row.node_execution_id,
    assistantId: row.assistant_id,
    goal: row.goal,
    status: row.status as AgentRunStatus,
    roundNo: row.round_no,
    budget: {
      maxRounds: row.max_rounds,
      maxSteps: row.max_steps,
      maxTotalTokens: row.max_total_tokens,
    },
    finalOutcome,
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    totalTokens: row.total_tokens,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapAgentHandoff(row: AgentHandoffRow): AgentHandoffView {
  return {
    id: row.id,
    runId: row.run_id,
    roundNo: row.round_no,
    seq: row.seq,
    fromRole: row.from_role as AgentRole,
    toRole: row.to_role as AgentRole | 'user',
    payload: JSON.parse(row.payload) as AgentHandoffPayload,
    createdAt: row.created_at,
  };
}
