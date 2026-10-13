import type { DatabaseInstance } from '../client';
import { newId, nowIso, mapScheduledTask, type ScheduledTaskRow } from './mappers';
import type {
  ScheduledTaskCreateInput,
  ScheduledTaskUpdateInput,
  ScheduledTaskView,
} from '@wbfm/shared/schemas';

export interface ScheduledTaskRepositoryDeps {
  /** 计算下一次触发（core 注入，database 不引 core）：过期 once 返回 null */
  computeNextRunMs: (
    spec: {
      kind: 'once' | 'daily' | 'weekly';
      hour: number;
      minute: number;
      weekday?: number | null;
      atDate?: string | null;
      timezone: string;
    },
    fromMs: number,
  ) => number | null;
  now?: () => number;
}

export function createScheduledTaskRepository(
  db: DatabaseInstance,
  deps: ScheduledTaskRepositoryDeps,
) {
  const clock = deps.now ?? Date.now;
  const nextRunIso = (input: {
    kind: 'once' | 'daily' | 'weekly';
    hour: number;
    minute: number;
    weekday?: number | null;
    atDate?: string | null;
    timezone: string;
  }): string => {
    const ms = deps.computeNextRunMs(input, clock());
    if (ms === null) {
      throw Object.assign(new Error('提醒时间已过期'), { code: 'SCHEDULE_EXPIRED' });
    }
    return new Date(ms).toISOString();
  };

  return {
    create(input: ScheduledTaskCreateInput): ScheduledTaskView {
      const id = newId();
      const ts = nowIso();
      const nextRunAt = nextRunIso(input);
      db.prepare(
        `INSERT INTO scheduled_tasks(
           id, assistant_id, kind, hour, minute, weekday, at_date, timezone, text,
           enabled, next_run_at, last_fired_at, created_at, updated_at)
         VALUES (
           @id, @assistantId, @kind, @hour, @minute, @weekday, @atDate, @timezone, @text,
           1, @nextRunAt, NULL, @ts, @ts)`,
      ).run({
        id,
        assistantId: input.assistantId,
        kind: input.kind,
        hour: input.hour,
        minute: input.minute,
        weekday: input.kind === 'weekly' ? input.weekday ?? null : null,
        atDate: input.kind === 'once' ? input.atDate ?? null : null,
        timezone: input.timezone,
        text: input.text,
        nextRunAt,
        ts,
      });
      return this.findById(id)!;
    },

    findById(id: string): ScheduledTaskView | null {
      const row = db.prepare(`SELECT * FROM scheduled_tasks WHERE id = ?`).get(id) as
        | ScheduledTaskRow
        | undefined;
      return row ? mapScheduledTask(row) : null;
    },

    list(assistantId?: string): ScheduledTaskView[] {
      const rows = (
        assistantId
          ? db
              .prepare(
                `SELECT * FROM scheduled_tasks WHERE assistant_id = ?
                 ORDER BY next_run_at ASC, id ASC`,
              )
              .all(assistantId)
          : db.prepare(`SELECT * FROM scheduled_tasks ORDER BY next_run_at ASC, id ASC`).all()
      ) as ScheduledTaskRow[];
      return rows.map(mapScheduledTask);
    },

    /** tick 用：enabled 且到点（idx_sched_next_run 索引） */
    listDue(nowMs: number = clock()): ScheduledTaskView[] {
      const nowIsoText = new Date(nowMs).toISOString();
      const rows = db
        .prepare(
          `SELECT * FROM scheduled_tasks
            WHERE enabled = 1 AND next_run_at <= ?
            ORDER BY next_run_at ASC, id ASC`,
        )
        .all(nowIsoText) as ScheduledTaskRow[];
      return rows.map(mapScheduledTask);
    },

    update(id: string, patch: ScheduledTaskUpdateInput): ScheduledTaskView | null {
      const existing = this.findById(id);
      if (!existing) return null;
      const next = {
        hour: patch.hour ?? existing.hour,
        minute: patch.minute ?? existing.minute,
        weekday: patch.weekday !== undefined ? patch.weekday : existing.weekday,
        atDate: patch.atDate !== undefined ? patch.atDate : existing.atDate,
        text: patch.text ?? existing.text,
        enabled: patch.enabled ?? existing.enabled,
      };
      // 时间字段任一变化都重算 next_run_at
      const timeChanged =
        patch.hour !== undefined ||
        patch.minute !== undefined ||
        patch.weekday !== undefined ||
        patch.atDate !== undefined;
      const nextRunAt = timeChanged
        ? nextRunIso({
            kind: existing.kind,
            hour: next.hour,
            minute: next.minute,
            weekday: next.weekday,
            atDate: next.atDate,
            timezone: existing.timezone,
          })
        : existing.nextRunAt;
      db.prepare(
        `UPDATE scheduled_tasks
            SET hour=@hour, minute=@minute, weekday=@weekday, at_date=@atDate, text=@text,
                enabled=@enabled, next_run_at=@nextRunAt, updated_at=@updatedAt
          WHERE id=@id`,
      ).run({
        id,
        hour: next.hour,
        minute: next.minute,
        weekday: existing.kind === 'weekly' ? next.weekday : null,
        atDate: existing.kind === 'once' ? next.atDate : null,
        text: next.text,
        enabled: next.enabled ? 1 : 0,
        nextRunAt,
        updatedAt: nowIso(),
      });
      return this.findById(id);
    },

    /**
     * tick 触发后推进（幂等由调用方「先 fire 后演出」保证）：
     * once → enabled=0（next_run_at 保留最后时刻）；daily/weekly → 重算严格未来时刻。
     * 行被删除/停用则 no-op。
     */
    markFired(id: string, firedAtMs: number = clock()): ScheduledTaskView | null {
      const existing = this.findById(id);
      if (!existing || !existing.enabled) return null;
      const firedIso = new Date(firedAtMs).toISOString();
      if (existing.kind === 'once') {
        db.prepare(
          `UPDATE scheduled_tasks
              SET enabled=0, last_fired_at=@firedAt, updated_at=@updatedAt WHERE id=@id`,
        ).run({ id, firedAt: firedIso, updatedAt: nowIso() });
      } else {
        // 从 firedAt 起算，若系统错过很久也只安排下一次（不补演）
        const nextMs = deps.computeNextRunMs(
          {
            kind: existing.kind,
            hour: existing.hour,
            minute: existing.minute,
            weekday: existing.weekday,
            atDate: existing.atDate,
            timezone: existing.timezone,
          },
          firedAtMs,
        );
        db.prepare(
          `UPDATE scheduled_tasks
              SET last_fired_at=@firedAt,
                  next_run_at=COALESCE(@nextRunAt, next_run_at),
                  updated_at=@updatedAt
            WHERE id=@id`,
        ).run({
          id,
          firedAt: firedIso,
          nextRunAt: nextMs === null ? null : new Date(nextMs).toISOString(),
          updatedAt: nowIso(),
        });
      }
      return this.findById(id);
    },

    setEnabled(id: string, enabled: boolean): ScheduledTaskView | null {
      return this.update(id, { enabled });
    },

    delete(id: string): boolean {
      return db.prepare(`DELETE FROM scheduled_tasks WHERE id = ?`).run(id).changes > 0;
    },

    /** 恢复后统一重算启用行 next_run_at（防备份时刻过期/漂移）；停用行不动 */
    recomputeEnabled(fromMs: number = clock()): number {
      const rows = db
        .prepare(`SELECT * FROM scheduled_tasks WHERE enabled = 1`)
        .all() as ScheduledTaskRow[];
      let touched = 0;
      for (const row of rows) {
        const ms = deps.computeNextRunMs(
          {
            kind: row.kind as ScheduledTaskCreateInput['kind'],
            hour: row.hour,
            minute: row.minute,
            weekday: row.weekday,
            atDate: row.at_date,
            timezone: row.timezone,
          },
          fromMs,
        );
        if (ms !== null) {
          db.prepare(`UPDATE scheduled_tasks SET next_run_at = ? WHERE id = ?`).run(
            new Date(ms).toISOString(),
            row.id,
          );
          touched += 1;
        }
      }
      return touched;
    },

    /** 备份导出用 */
    listAll(): ScheduledTaskView[] {
      return (
        db
          .prepare(`SELECT * FROM scheduled_tasks ORDER BY created_at ASC, id ASC`)
          .all() as ScheduledTaskRow[]
      ).map(mapScheduledTask);
    },

    /** 备份恢复：INSERT OR IGNORE（助手不存在由 FK 跳过），返回是否插入 */
    restoreOne(view: ScheduledTaskView): boolean {
      const result = db
        .prepare(
          `INSERT OR IGNORE INTO scheduled_tasks(
             id, assistant_id, kind, hour, minute, weekday, at_date, timezone, text,
             enabled, next_run_at, last_fired_at, created_at, updated_at)
           VALUES (
             @id, @assistantId, @kind, @hour, @minute, @weekday, @atDate, @timezone, @text,
             @enabled, @nextRunAt, @lastFiredAt, @createdAt, @updatedAt)`,
        )
        .run({
          id: view.id,
          assistantId: view.assistantId,
          kind: view.kind,
          hour: view.hour,
          minute: view.minute,
          weekday: view.weekday,
          atDate: view.atDate,
          timezone: view.timezone,
          text: view.text,
          enabled: view.enabled ? 1 : 0,
          nextRunAt: view.nextRunAt,
          lastFiredAt: view.lastFiredAt,
          createdAt: view.createdAt,
          updatedAt: view.updatedAt,
        });
      return result.changes > 0;
    },
  };
}

export type ScheduledTaskRepository = ReturnType<typeof createScheduledTaskRepository>;
