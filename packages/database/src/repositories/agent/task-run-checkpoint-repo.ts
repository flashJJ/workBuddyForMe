import type {
  AgentBudgetUsage,
  ExecutorOutcome,
  SubtaskSpec,
} from '@wbfm/shared/schemas';
import type { DatabaseInstance } from '../../client';
import { newId, nowIso } from '../ops/mappers';

/**
 * v4.7 P1：协作运行检查点仓储。
 * 每个 agent_run 至多一行（UNIQUE agent_run_id），按轮/阶段 upsert；
 * 与 agent_handoffs 的区别：handoff 是审计流水，checkpoint 是「当前可恢复位置」。
 */

export type CheckpointPhase = 'planning' | 'executing' | 'reviewing';

export interface TaskRunCheckpointView {
  id: string;
  agentRunId: string;
  roundNo: number;
  phase: CheckpointPhase;
  subtask: SubtaskSpec | null;
  outcome: ExecutorOutcome | null;
  usage: AgentBudgetUsage;
  resumable: boolean;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CheckpointRow {
  id: string;
  agent_run_id: string;
  round_no: number;
  phase: string;
  subtask_json: string | null;
  outcome_json: string | null;
  budget_json: string;
  resumable: number;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface CheckpointUpsertFields {
  agentRunId: string;
  roundNo: number;
  phase: CheckpointPhase;
  subtask?: SubtaskSpec | null;
  outcome?: ExecutorOutcome | null;
  usage: AgentBudgetUsage;
  resumable?: boolean;
  note?: string | null;
}

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function mapRow(row: CheckpointRow): TaskRunCheckpointView {
  return {
    id: row.id,
    agentRunId: row.agent_run_id,
    roundNo: row.round_no,
    phase: row.phase as CheckpointPhase,
    subtask: parseJson<SubtaskSpec>(row.subtask_json),
    outcome: parseJson<ExecutorOutcome>(row.outcome_json),
    usage: parseJson<AgentBudgetUsage>(row.budget_json) ?? {
      round: row.round_no,
      steps: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    },
    resumable: row.resumable === 1,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createTaskRunCheckpointRepository(db: DatabaseInstance) {
  return {
    upsert(fields: CheckpointUpsertFields): TaskRunCheckpointView {
      const now = nowIso();
      const id = newId();
      db.prepare(
        `INSERT INTO task_run_checkpoints(
           id, agent_run_id, round_no, phase, subtask_json, outcome_json,
           budget_json, resumable, note, created_at, updated_at
         ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(agent_run_id) DO UPDATE SET
           round_no=excluded.round_no,
           phase=excluded.phase,
           subtask_json=excluded.subtask_json,
           outcome_json=excluded.outcome_json,
           budget_json=excluded.budget_json,
           resumable=excluded.resumable,
           note=excluded.note,
           updated_at=excluded.updated_at`,
      ).run(
        id,
        fields.agentRunId,
        fields.roundNo,
        fields.phase,
        fields.subtask ? JSON.stringify(fields.subtask) : null,
        fields.outcome ? JSON.stringify(fields.outcome) : null,
        JSON.stringify(fields.usage),
        fields.resumable === false ? 0 : 1,
        fields.note ?? null,
        now,
        now,
      );
      return this.getByRunId(fields.agentRunId)!;
    },

    getByRunId(agentRunId: string): TaskRunCheckpointView | null {
      const row = db
        .prepare(`SELECT * FROM task_run_checkpoints WHERE agent_run_id=?`)
        .get(agentRunId) as CheckpointRow | undefined;
      return row ? mapRow(row) : null;
    },

    /** 服务重启扫描：可续跑检查点（最近的在前） */
    listResumable(limit = 50): TaskRunCheckpointView[] {
      const rows = db
        .prepare(
          `SELECT * FROM task_run_checkpoints WHERE resumable=1 ORDER BY updated_at DESC LIMIT ?`,
        )
        .all(limit) as CheckpointRow[];
      return rows.map(mapRow);
    },

    markNotResumable(agentRunId: string, note?: string | null): void {
      db.prepare(
        `UPDATE task_run_checkpoints SET resumable=0, note=?, updated_at=? WHERE agent_run_id=?`,
      ).run(note ?? null, nowIso(), agentRunId);
    },

    deleteByRunId(agentRunId: string): void {
      db.prepare(`DELETE FROM task_run_checkpoints WHERE agent_run_id=?`).run(agentRunId);
    },
  };
}

export type TaskRunCheckpointRepository = ReturnType<typeof createTaskRunCheckpointRepository>;
