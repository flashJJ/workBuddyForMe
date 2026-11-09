/**
 * v2.32 M2：tasks 轨加法负载——协作运行（agent_runs）与角色交接（agent_handoffs）。
 * 直接读原始行，保持字段与数据库一致，恢复端按主键 upsert。
 */
import type { DatabaseInstance } from '@wbfm/database';

export interface AgentRunTrackEntry {
  id: string;
  conversationId: string | null;
  flowRunId: string | null;
  nodeExecutionId: string | null;
  assistantId: string;
  goal: string;
  status: string;
  roundNo: number;
  maxRounds: number;
  maxSteps: number;
  maxTotalTokens: number;
  finalOutcome: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentHandoffTrackEntry {
  id: string;
  runId: string;
  roundNo: number;
  seq: number;
  fromRole: string;
  toRole: string;
  payload: string;
  createdAt: string;
}

interface AgentRunRow {
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

interface AgentHandoffRow {
  id: string;
  run_id: string;
  round_no: number;
  seq: number;
  from_role: string;
  to_role: string;
  payload: string;
  created_at: string;
}

/** 全量协作运行（上限 1 万条，按创建时间升序） */
export function serializeAgentRunsTrack(db: DatabaseInstance): AgentRunTrackEntry[] {
  const rows = db
    .prepare('SELECT * FROM agent_runs ORDER BY created_at ASC LIMIT 10000')
    .all() as AgentRunRow[];
  return rows.map((row) => ({
    id: row.id,
    conversationId: row.conversation_id,
    flowRunId: row.flow_run_id,
    nodeExecutionId: row.node_execution_id,
    assistantId: row.assistant_id,
    goal: row.goal,
    status: row.status,
    roundNo: row.round_no,
    maxRounds: row.max_rounds,
    maxSteps: row.max_steps,
    maxTotalTokens: row.max_total_tokens,
    finalOutcome: row.final_outcome,
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    totalTokens: row.total_tokens,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/** 全量角色交接（上限 5 万条，按运行与轮次排序） */
export function serializeAgentHandoffsTrack(db: DatabaseInstance): AgentHandoffTrackEntry[] {
  const rows = db
    .prepare('SELECT * FROM agent_handoffs ORDER BY run_id ASC, round_no ASC, seq ASC LIMIT 50000')
    .all() as AgentHandoffRow[];
  return rows.map((row) => ({
    id: row.id,
    runId: row.run_id,
    roundNo: row.round_no,
    seq: row.seq,
    fromRole: row.from_role,
    toRole: row.to_role,
    payload: row.payload,
    createdAt: row.created_at,
  }));
}
