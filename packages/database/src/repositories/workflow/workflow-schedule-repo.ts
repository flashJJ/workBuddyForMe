import type { FlowScheduleLastStatus, FlowScheduleView } from '@wbfm/shared/types';
import type { DatabaseInstance } from '../../client';
import { newId, nowIso } from '../ops/mappers';

/**
 * v4.26：流程定时配置仓储。
 * 一个流程可有多行；到期扫描与原子认领仍走 (enabled, next_run_at) 索引。
 */

export interface WorkflowScheduleRow {
  id: string;
  workflow_id: string;
  name: string;
  cron: string;
  timezone: string;
  enabled: number;
  input_json: string | null;
  next_run_at: string;
  last_run_at: string | null;
  last_run_id: string | null;
  last_status: string | null;
  missed_count: number;
  last_missed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduleCreateFields {
  workflowId: string;
  name: string;
  cron: string;
  timezone: string;
  enabled: boolean;
  input?: Record<string, unknown> | null;
  nextRunAt: string;
}

export interface ScheduleUpdateFields {
  name?: string;
  cron?: string;
  timezone?: string;
  enabled?: boolean;
  /** null 表示清空 */
  input?: Record<string, unknown> | null;
  nextRunAt?: string;
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
    name: row.name,
    cron: row.cron,
    timezone: row.timezone,
    enabled: row.enabled === 1,
    input: parseJson<Record<string, unknown> | null>(row.input_json, null),
    nextRunAt: row.next_run_at,
    lastRunAt: row.last_run_at,
    lastRunId: row.last_run_id,
    lastStatus: (row.last_status as FlowScheduleLastStatus | null) ?? null,
    missedCount: row.missed_count ?? 0,
    lastMissedAt: row.last_missed_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createWorkflowScheduleRepository(db: DatabaseInstance) {
  function getRow(id: string): WorkflowScheduleRow | null {
    return (
      (db.prepare('SELECT * FROM workflow_schedules WHERE id = ?').get(id) as
        | WorkflowScheduleRow
        | undefined) ?? null
    );
  }

  return {
    listByWorkflow(workflowId: string): FlowScheduleView[] {
      const rows = db
        .prepare('SELECT * FROM workflow_schedules WHERE workflow_id = ? ORDER BY created_at ASC')
        .all(workflowId) as WorkflowScheduleRow[];
      return rows.map(mapSchedule);
    },

    /** v5.0：健康面板跨流程列出 */
    listAll(limit = 200): FlowScheduleView[] {
      const rows = db
        .prepare('SELECT * FROM workflow_schedules ORDER BY created_at DESC LIMIT ?')
        .all(limit) as WorkflowScheduleRow[];
      return rows.map(mapSchedule);
    },

    getById(id: string): FlowScheduleView | null {
      const row = getRow(id);
      return row ? mapSchedule(row) : null;
    },

    countByWorkflow(workflowId: string): number {
      const row = db
        .prepare('SELECT COUNT(*) AS n FROM workflow_schedules WHERE workflow_id = ?')
        .get(workflowId) as { n: number };
      return row.n;
    },

    create(fields: ScheduleCreateFields): FlowScheduleView {
      const id = newId();
      const ts = nowIso();
      db.prepare(
        `INSERT INTO workflow_schedules
           (id, workflow_id, name, cron, timezone, enabled, input_json, next_run_at,
            last_run_at, last_run_id, last_status, created_at, updated_at)
         VALUES
           (@id, @workflowId, @name, @cron, @timezone, @enabled, @inputJson, @nextRunAt,
            NULL, NULL, NULL, @ts, @ts)`,
      ).run({
        id,
        workflowId: fields.workflowId,
        name: fields.name,
        cron: fields.cron,
        timezone: fields.timezone,
        enabled: fields.enabled ? 1 : 0,
        inputJson:
          fields.input === undefined || fields.input === null ? null : JSON.stringify(fields.input),
        nextRunAt: fields.nextRunAt,
        ts,
      });
      return mapSchedule(getRow(id)!);
    },

    update(id: string, fields: ScheduleUpdateFields): FlowScheduleView | null {
      const row = getRow(id);
      if (!row) return null;
      db.prepare(
        `UPDATE workflow_schedules
         SET name = @name, cron = @cron, timezone = @timezone, enabled = @enabled,
             input_json = @inputJson, next_run_at = @nextRunAt, updated_at = @ts
         WHERE id = @id`,
      ).run({
        id,
        name: fields.name ?? row.name,
        cron: fields.cron ?? row.cron,
        timezone: fields.timezone ?? row.timezone,
        enabled: fields.enabled === undefined ? row.enabled : fields.enabled ? 1 : 0,
        inputJson:
          fields.input === undefined
            ? row.input_json
            : fields.input === null
              ? null
              : JSON.stringify(fields.input),
        nextRunAt: fields.nextRunAt ?? row.next_run_at,
        ts: nowIso(),
      });
      return mapSchedule(getRow(id)!);
    },

    remove(id: string): boolean {
      return db.prepare('DELETE FROM workflow_schedules WHERE id = ?').run(id).changes > 0;
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

    /** v5.0：累计错过次数（跨启动保留） */
    recordMissed(id: string, missedCount: number, atIso: string): void {
      db.prepare(
        `UPDATE workflow_schedules
         SET missed_count = missed_count + @missedCount,
             last_missed_at = @at, updated_at = @ts
         WHERE id = @id`,
      ).run({ id, missedCount: Math.max(0, missedCount), at: atIso, ts: nowIso() });
    },
  };
}

export type WorkflowScheduleRepository = ReturnType<typeof createWorkflowScheduleRepository>;
