import {
  type FlowCompensationState,
  type FlowRunCompensationView,
  type FlowRunError,
} from '@wbfm/shared/types';
import { FLOW_COMPENSATION_MAX_ATTEMPTS } from '@wbfm/shared/schemas';
import type { DatabaseInstance } from '../../client';
import { newId, nowIso } from '../ops/mappers';

/**
 * v5.0 失败补偿队列仓储。
 * 一条失败链一行（root_run_id 唯一）；补偿重放只推进 attempt/last_run_id/state。
 */

export interface FlowRunCompensationRow {
  id: string;
  root_run_id: string;
  workflow_id: string;
  attempt: number;
  state: string;
  next_retry_at: string | null;
  last_run_id: string | null;
  last_error_json: string | null;
  created_at: string;
  updated_at: string;
}

function parseError(raw: string | null): FlowRunError | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FlowRunError;
  } catch {
    return null;
  }
}

function mapCompensation(row: FlowRunCompensationRow): FlowRunCompensationView {
  return {
    id: row.id,
    rootRunId: row.root_run_id,
    workflowId: row.workflow_id,
    attempt: row.attempt,
    maxAttempts: FLOW_COMPENSATION_MAX_ATTEMPTS,
    state: row.state as FlowCompensationState,
    nextRetryAt: row.next_retry_at,
    lastRunId: row.last_run_id,
    lastError: parseError(row.last_error_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CompensationCreateFields {
  rootRunId: string;
  workflowId: string;
  attempt: number;
  nextRetryAt: string;
  lastErrorJson: string;
}

export function createFlowRunCompensationRepository(db: DatabaseInstance) {
  function getRow(id: string): FlowRunCompensationRow | null {
    return (
      (db.prepare('SELECT * FROM flow_run_compensations WHERE id = ?').get(id) as
        | FlowRunCompensationRow
        | undefined) ?? null
    );
  }

  function getBy(column: 'root_run_id' | 'last_run_id', value: string): FlowRunCompensationView | null {
    const row = db
      .prepare(`SELECT * FROM flow_run_compensations WHERE ${column} = ? LIMIT 1`)
      .get(value) as FlowRunCompensationRow | undefined;
    return row ? mapCompensation(row) : null;
  }

  return {
    getByRootRun(rootRunId: string): FlowRunCompensationView | null {
      return getBy('root_run_id', rootRunId);
    },

    getByLastRun(lastRunId: string): FlowRunCompensationView | null {
      return getBy('last_run_id', lastRunId);
    },

    listDue(nowIsoValue: string, limit = 100): FlowRunCompensationView[] {
      const rows = db
        .prepare(
          `SELECT * FROM flow_run_compensations
           WHERE state = 'pending' AND next_retry_at IS NOT NULL AND next_retry_at <= ?
           ORDER BY next_retry_at ASC LIMIT ?`,
        )
        .all(nowIsoValue, limit) as FlowRunCompensationRow[];
      return rows.map(mapCompensation);
    },

    listByWorkflow(workflowId: string): FlowRunCompensationView[] {
      const rows = db
        .prepare(
          `SELECT * FROM flow_run_compensations
           WHERE workflow_id = ? ORDER BY created_at DESC`,
        )
        .all(workflowId) as FlowRunCompensationRow[];
      return rows.map(mapCompensation);
    },

    /** v5.0：清理保护——pending/retrying 的 root/last 运行不可删 */
    listActive(): FlowRunCompensationView[] {
      const rows = db
        .prepare(
          `SELECT * FROM flow_run_compensations
           WHERE state IN ('pending','retrying')`,
        )
        .all() as FlowRunCompensationRow[];
      return rows.map(mapCompensation);
    },

    countsByState(): { pending: number; exhausted: number } {
      const rows = db
        .prepare(
          `SELECT state, COUNT(*) AS n FROM flow_run_compensations
           WHERE state IN ('pending','exhausted') GROUP BY state`,
        )
        .all() as Array<{ state: string; n: number }>;
      const pending = rows.find((row) => row.state === 'pending')?.n ?? 0;
      const exhausted = rows.find((row) => row.state === 'exhausted')?.n ?? 0;
      return { pending, exhausted };
    },

    create(fields: CompensationCreateFields): FlowRunCompensationView {
      const id = newId();
      const ts = nowIso();
      db.prepare(
        `INSERT INTO flow_run_compensations
           (id, root_run_id, workflow_id, attempt, state, next_retry_at,
            last_run_id, last_error_json, created_at, updated_at)
         VALUES
           (@id, @rootRunId, @workflowId, @attempt, 'pending', @nextRetryAt,
            NULL, @lastErrorJson, @ts, @ts)`,
      ).run({
        id,
        rootRunId: fields.rootRunId,
        workflowId: fields.workflowId,
        attempt: fields.attempt,
        nextRetryAt: fields.nextRetryAt,
        lastErrorJson: fields.lastErrorJson,
        ts,
      });
      return mapCompensation(getRow(id)!);
    },

    claim(id: string, expectedNextRetryAt: string): boolean {
      const result = db
        .prepare(
          `UPDATE flow_run_compensations
           SET state = 'retrying', next_retry_at = NULL, updated_at = @ts
           WHERE id = @id AND state = 'pending' AND next_retry_at = @expected`,
        )
        .run({ id, expected: expectedNextRetryAt, ts: nowIso() });
      return result.changes === 1;
    },

    markRetrying(id: string, lastRunId: string): void {
      db.prepare(
        `UPDATE flow_run_compensations
         SET state = 'retrying', last_run_id = @lastRunId, updated_at = @ts
         WHERE id = @id`,
      ).run({ id, lastRunId, ts: nowIso() });
    },

    markPending(id: string, attempt: number, nextRetryAt: string, lastErrorJson: string): void {
      db.prepare(
        `UPDATE flow_run_compensations
         SET state = 'pending', attempt = @attempt, next_retry_at = @nextRetryAt,
             last_error_json = @lastErrorJson, updated_at = @ts
         WHERE id = @id`,
      ).run({ id, attempt, nextRetryAt, lastErrorJson, ts: nowIso() });
    },

    markRecovered(id: string): void {
      db.prepare(
        `UPDATE flow_run_compensations
         SET state = 'recovered', next_retry_at = NULL, updated_at = @ts
         WHERE id = @id`,
      ).run({ id, ts: nowIso() });
    },

    markExhausted(id: string, lastErrorJson: string): void {
      db.prepare(
        `UPDATE flow_run_compensations
         SET state = 'exhausted', next_retry_at = NULL, last_error_json = @lastErrorJson,
             updated_at = @ts
         WHERE id = @id`,
      ).run({ id, lastErrorJson, ts: nowIso() });
    },

    markCancelled(id: string): void {
      db.prepare(
        `UPDATE flow_run_compensations
         SET state = 'cancelled', next_retry_at = NULL, updated_at = @ts
         WHERE id = @id`,
      ).run({ id, ts: nowIso() });
    },
  };
}

export type FlowRunCompensationRepository = ReturnType<
  typeof createFlowRunCompensationRepository
>;
