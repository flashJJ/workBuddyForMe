import type { DatabaseInstance } from '../client';
import type { SubagentRunStatus, SubagentRunView } from '@wbfm/shared/schemas';
import { newId, nowIso } from './mappers';

interface SubagentRunRow {
  id: string;
  provider_id: string;
  goal: string;
  cwd: string;
  conversation_id: string | null;
  status: string;
  summary: string | null;
  error_code: string | null;
  error_message: string | null;
  output_bytes: number;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
}

function mapRow(row: SubagentRunRow): SubagentRunView {
  return {
    id: row.id,
    providerId: row.provider_id,
    goal: row.goal,
    cwd: row.cwd,
    conversationId: row.conversation_id,
    status: row.status as SubagentRunStatus,
    summary: row.summary,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    outputBytes: row.output_bytes,
    createdAt: row.created_at,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
}

/** v2.11：外部代理运行证据（表由迁移 v040 建立） */
export function createSubagentRunRepository(db: DatabaseInstance) {
  return {
    create(input: {
      providerId: string;
      goal: string;
      cwd: string;
      conversationId: string | null;
    }): SubagentRunView {
      const id = newId();
      db.prepare(
        `INSERT INTO subagent_runs(
           id, provider_id, goal, cwd, conversation_id, status, output_bytes, created_at)
         VALUES (@id, @providerId, @goal, @cwd, @conversationId, 'queued', 0, @ts)`,
      ).run({ id, ...input, ts: nowIso() });
      return this.get(id)!;
    },

    get(id: string): SubagentRunView | null {
      const row = db
        .prepare('SELECT * FROM subagent_runs WHERE id = ?')
        .get(id) as SubagentRunRow | undefined;
      return row ? mapRow(row) : null;
    },

    list(limit = 20): SubagentRunView[] {
      const rows = db
        .prepare('SELECT * FROM subagent_runs ORDER BY created_at DESC, rowid DESC LIMIT ?')
        .all(Math.min(Math.max(limit, 1), 50)) as SubagentRunRow[];
      return rows.map(mapRow);
    },

    markStarted(id: string, startedAt = nowIso()): void {
      db.prepare(`UPDATE subagent_runs SET status = 'running', started_at = ? WHERE id = ?`).run(
        startedAt,
        id,
      );
    },

    /** 终态收敛：只写一次（重复调用以最后一次为准，避免并发竞态丢字段） */
    finish(
      id: string,
      input: {
        status: Exclude<SubagentRunStatus, 'queued' | 'running'>;
        summary?: string | null;
        errorCode?: string | null;
        errorMessage?: string | null;
        outputBytes?: number;
        endedAt?: string;
      },
    ): SubagentRunView | null {
      db.prepare(
        `UPDATE subagent_runs
            SET status = @status,
                summary = @summary,
                error_code = @errorCode,
                error_message = @errorMessage,
                output_bytes = @outputBytes,
                ended_at = @endedAt
          WHERE id = @id`,
      ).run({
        id,
        status: input.status,
        summary: input.summary ?? null,
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
        outputBytes: input.outputBytes ?? 0,
        endedAt: input.endedAt ?? nowIso(),
      });
      return this.get(id);
    },
  };
}

export type SubagentRunRepository = ReturnType<typeof createSubagentRunRepository>;
