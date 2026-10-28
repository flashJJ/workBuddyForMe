import {
  AGENT_BUDGET_DEFAULTS,
  agentHandoffPayloadSchema,
  type AgentBudget,
  type AgentHandoffPayload,
  type AgentHandoffView,
  type AgentRole,
  type AgentRunStatus,
  type AgentRunView,
  type ExecutorOutcome,
} from '@wbfm/shared/schemas';
import type { DatabaseInstance } from '../client';
import { newId, nowIso } from './mappers';
import {
  mapAgentHandoff,
  mapAgentRun,
  type AgentHandoffRow,
  type AgentRunRow,
} from './agent-run-mappers';

/**
 * 协作运行/交接仓储（v1.4 M1）。
 * - agent_runs：一次协作运行的生命周期行（创建→轮次/token 累加→终态）；
 * - agent_handoffs：角色交接流水，seq 由仓储在轮内自增，payload 经 zod 校验。
 * 状态机非法转移（终态后再写）由仓储拒绝，runner 是唯一写方。
 */

export interface AgentRunCreateFields {
  id?: string;
  conversationId?: string | null;
  flowRunId?: string | null;
  nodeExecutionId?: string | null;
  assistantId: string;
  goal: string;
  budget?: Partial<AgentBudget>;
}

export interface AgentHandoffAddFields {
  id?: string;
  runId: string;
  roundNo: number;
  fromRole: AgentRole;
  toRole: AgentRole | 'user';
  payload: AgentHandoffPayload;
}

export interface AgentRunTokenPatch {
  promptTokens?: number;
  completionTokens?: number;
}

const TERMINAL_STATUSES: ReadonlySet<AgentRunStatus> = new Set([
  'done',
  'failed',
  'cancelled',
  'budget_exceeded',
]);

export function createAgentRunRepository(db: DatabaseInstance) {
  const requireRunning = (id: string): AgentRunRow => {
    const row = db.prepare(`SELECT * FROM agent_runs WHERE id=?`).get(id) as
      | AgentRunRow
      | undefined;
    if (!row) throw new Error(`协作运行不存在：${id}`);
    if (TERMINAL_STATUSES.has(row.status as AgentRunStatus)) {
      throw new Error(`协作运行已终态（${row.status}），拒绝写入：${id}`);
    }
    return row;
  };

  return {
    create(fields: AgentRunCreateFields): AgentRunView {
      const budget: AgentBudget = { ...AGENT_BUDGET_DEFAULTS, ...fields.budget };
      const id = fields.id ?? newId();
      const now = nowIso();
      db.prepare(
        `INSERT INTO agent_runs(
           id, conversation_id, flow_run_id, node_execution_id, assistant_id, goal,
           status, round_no, max_rounds, max_steps, max_total_tokens, created_at, updated_at
         ) VALUES(?, ?, ?, ?, ?, ?, 'running', 0, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        fields.conversationId ?? null,
        fields.flowRunId ?? null,
        fields.nodeExecutionId ?? null,
        fields.assistantId,
        fields.goal,
        budget.maxRounds,
        budget.maxSteps,
        budget.maxTotalTokens,
        now,
        now,
      );
      return this.getById(id)!;
    },

    getById(id: string): AgentRunView | null {
      const row = db.prepare(`SELECT * FROM agent_runs WHERE id=?`).get(id) as
        | AgentRunRow
        | undefined;
      return row ? mapAgentRun(row) : null;
    },

    /** 任务中心列表（按创建时间倒序）；conversationId 可选过滤 */
    list(filter: { conversationId?: string | null; limit?: number } = {}): AgentRunView[] {
      const limit = Math.min(filter.limit ?? 100, 200);
      const rows = filter.conversationId
        ? (db
            .prepare(
              `SELECT * FROM agent_runs WHERE conversation_id=? ORDER BY created_at DESC, rowid DESC LIMIT ?`,
            )
            .all(filter.conversationId, limit) as AgentRunRow[])
        : (db
            .prepare(`SELECT * FROM agent_runs ORDER BY created_at DESC, rowid DESC LIMIT ?`)
            .all(limit) as AgentRunRow[]);
      return rows.map(mapAgentRun);
    },

    /** v2.8：列出 running 运行（重启恢复扫描用） */
    listRunning(): AgentRunView[] {
      const rows = db
        .prepare(`SELECT * FROM agent_runs WHERE status='running' ORDER BY created_at ASC`)
        .all() as AgentRunRow[];
      return rows.map(mapAgentRun);
    },

    /** v2.8：写作业租约 */
    setLease(id: string, owner: string, expiresAt: string): void {
      db.prepare(
        'UPDATE agent_runs SET lease_owner=?, lease_expires_at=?, updated_at=? WHERE id=?',
      ).run(owner, expiresAt, nowIso(), id);
    },

    /** v2.8：终态/异常释放租约 */
    clearLease(id: string): void {
      db.prepare(
        'UPDATE agent_runs SET lease_owner=NULL, lease_expires_at=NULL WHERE id=?',
      ).run(id);
    },

    /** 轮次推进（返工进入下一轮） */
    setRound(id: string, roundNo: number): void {
      requireRunning(id);
      db.prepare(`UPDATE agent_runs SET round_no=?, updated_at=? WHERE id=?`).run(
        roundNo,
        nowIso(),
        id,
      );
    },

    /** 累加 token（各字段分别非负；updated_at 同步） */
    addTokens(id: string, patch: AgentRunTokenPatch): AgentRunView {
      requireRunning(id);
      const prompt = Math.max(0, Math.trunc(patch.promptTokens ?? 0));
      const completion = Math.max(0, Math.trunc(patch.completionTokens ?? 0));
      db.prepare(
        `UPDATE agent_runs SET
           prompt_tokens = prompt_tokens + ?,
           completion_tokens = completion_tokens + ?,
           total_tokens = total_tokens + ?,
           updated_at = ?
         WHERE id=?`,
      ).run(prompt, completion, prompt + completion, nowIso(), id);
      return this.getById(id)!;
    },

    /** 终态收尾（done 带最终交付；failed/budget_exceeded/cancelled 可带错误） */
    finalize(
      id: string,
      params: {
        status: Exclude<AgentRunStatus, 'running'>;
        finalOutcome?: ExecutorOutcome | null;
        errorCode?: string | null;
        errorMessage?: string | null;
      },
    ): AgentRunView {
      requireRunning(id);
      db.prepare(
        `UPDATE agent_runs SET
           status=?, final_outcome=?, error_code=?, error_message=?, updated_at=?
         WHERE id=?`,
      ).run(
        params.status,
        params.finalOutcome ? JSON.stringify(params.finalOutcome) : null,
        params.errorCode ?? null,
        params.errorMessage ?? null,
        nowIso(),
        id,
      );
      return this.getById(id)!;
    },

    /** 追加交接；seq 在 (run, round) 内自增；payload 必须通过 zod 校验 */
    addHandoff(fields: AgentHandoffAddFields): AgentHandoffView {
      requireRunning(fields.runId);
      const parsed = agentHandoffPayloadSchema.safeParse(fields.payload);
      if (!parsed.success) {
        throw new Error(`非法交接载荷：${parsed.error.issues.map((i) => i.message).join('；')}`);
      }
      const id = fields.id ?? newId();
      const now = nowIso();
      const nextSeq = (
        db
          .prepare(
            `SELECT COALESCE(MAX(seq), -1) + 1 AS next FROM agent_handoffs
             WHERE run_id=? AND round_no=?`,
          )
          .get(fields.runId, fields.roundNo) as { next: number }
      ).next;
      db.prepare(
        `INSERT INTO agent_handoffs(id,run_id,round_no,seq,from_role,to_role,payload,created_at)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        fields.runId,
        fields.roundNo,
        nextSeq,
        fields.fromRole,
        fields.toRole,
        JSON.stringify(parsed.data),
        now,
      );
      return this.getHandoff(id)!;
    },

    getHandoff(id: string): AgentHandoffView | null {
      const row = db.prepare(`SELECT * FROM agent_handoffs WHERE id=?`).get(id) as
        | AgentHandoffRow
        | undefined;
      return row ? mapAgentHandoff(row) : null;
    },

    listHandoffs(runId: string): AgentHandoffView[] {
      const rows = db
        .prepare(`SELECT * FROM agent_handoffs WHERE run_id=? ORDER BY round_no, seq`)
        .all(runId) as AgentHandoffRow[];
      return rows.map(mapAgentHandoff);
    },
  };
}

export type AgentRunRepository = ReturnType<typeof createAgentRunRepository>;
