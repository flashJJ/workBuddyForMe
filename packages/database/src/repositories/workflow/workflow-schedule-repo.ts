import type { FlowScheduleLastStatus, FlowScheduleView } from '@wbfm/shared/types';
import type { DatabaseInstance } from '../../client';
import { newId, nowIso } from '../ops/mappers';

/**
 * v4.24：流程定时配置仓储。
 * 一个流程至多一行；到期扫描与原子认领都走 (enabled, next_run_at) 索引。
 */

export interface WorkflowScheduleRow {
  id: string;
  workflow_id: string;
  cron: string;
  enabled: number;
  input_json: string | null;
  next_run_at: string;
  last_run_at: string | null;
  last_run_id: string | null;
  last_status: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduleUpsertFields {
  workflowId: string;
  cron: string;
  enabled: boolean;
  input?: Record<string, unknown> | null;
  nextRunAt: string;
}

export interface ScheduleOutcome {
  lastRunAt: string;
  lastRunId?: string | null;
  lastStatus: FlowScheduleLastStatus;
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (raw === null || raw === '') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function mapSchedule(row: WorkflowScheduleRow): FlowScheduleView {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    cron: row.cron,
    enabled: row.enabled === 1,
    input: parseJson<Record<string, unknown> | null>(row.input_json, null),
    nextRunAt: row.next_run_at,
    lastRunAt: row.last_run_at,
    lastRunId: row.last_run_id,
    lastStatus: (row.last_status as FlowScheduleLastStatus | null) ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createWorkflowScheduleRepository(db: DatabaseInstance) {
  function getRowByWorkflow(workflowId: string): WorkflowScheduleRow | null {
    return (
      (db.prepare('SELECT * FROM workflow_schedules WHERE workflow_id = ?').get(workflowId) as
        | WorkflowScheduleRow
        | undefined) ?? null
    );
  }

  return {
    getByWorkflow(workflowId: string): FlowScheduleView | null {
      const row = getRowByWorkflow(workflowId);
      return row ? mapSchedule(row) : null;
    },

    /** 到期调度：enabled=1 且 next_run_at <= now，按时间升序 */
    listDue(nowIsoValue: string, limit = 100): FlowScheduleView[] {
      const rows = db
        .prepare(
          `SELECT * FROM workflow_schedules
           WHERE enabled = 1 AND next_run_at <= ?
           ORDER BY next_run_at ASC LIMIT ?`,
        )
        .all(nowIsoValue, limit) as WorkflowScheduleRow[];
      return rows.map(mapSchedule);
    },

    upsert(fields: ScheduleUpsertFields): FlowScheduleView {
      const existing = getRowByWorkflow(fields.workflowId);
      const ts = nowIso();
      const inputJson = fields.input === undefined || fields.input === null ? null : JSON.stringify(fields.input);
      if (existing) {
        db.prepare(
          `UPDATE workflow_schedules
           SET cron = @cron, enabled = @enabled, input_json = @inputJson,
               next_run_at = @nextRunAt, updated_at = @ts
           WHERE id = @id`,
        ).run({
          id: existing.id,
          cron: fields.cron,
          enabled: fields.enabled ? 1 : 0,
          inputJson,
          nextRunAt: fields.nextRunAt,
          ts,
        });
      } else {
        db.prepare(
          `INSERT INTO workflow_schedules
             (id, workflow_id, cron, enabled, input_json, next_run_at,
              last_run_at, last_run_id, last_status, created_at, updated_at)
           VALUES
             (@id, @workflowId, @cron, @enabled, @inputJson, @nextRunAt,
              NULL, NULL, NULL, @ts, @ts)`,
        ).run({
          id: newId(),
          workflowId: fields.workflowId,
          cron: fields.cron,
          enabled: fields.enabled ? 1 : 0,
          inputJson,
          nextRunAt: fields.nextRunAt,
          ts,
        });
      }
      return mapSchedule(getRowByWorkflow(fields.workflowId)!);
    },

    removeByWorkflow(workflowId: string): boolean {
      return db.prepare('DELETE FROM workflow_schedules WHERE workflow_id = ?').run(workflowId).changes > 0;
    },

    /** 原子认领：只有 next_run_at 仍是 expected 且启用时才推进 */
    claimDue(id: string, expectedNextRunAt: string, nextRunAt: string): boolean {
      const result = db
        .prepare(
          `UPDATE workflow_schedules
           SET next_run_at = @nextRunAt, updated_at = @ts
           WHERE id = @id AND enabled = 1 AND next_run_at = @expected`,
        )
        .run({ id, expected: expectedNextRunAt, nextRunAt, ts: nowIso() });
      return result.changes === 1;
    },

    recordOutcome(id: string, outcome: ScheduleOutcome): void {
      db.prepare(
        `UPDATE workflow_schedules
         SET last_run_at = @lastRunAt, last_run_id = @lastRunId,
             last_status = @lastStatus, updated_at = @ts
         WHERE id = @id`,
      ).run({
        id,
        lastRunAt: outcome.lastRunAt,
        lastRunId: outcome.lastRunId ?? null,
        lastStatus: outcome.lastStatus,
        ts: nowIso(),
      });
    },
  };
}

export type WorkflowScheduleRepository = ReturnType<typeof createWorkflowScheduleRepository>;
