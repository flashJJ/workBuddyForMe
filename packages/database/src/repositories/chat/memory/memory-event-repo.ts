import type { DatabaseInstance } from '../../../client';
import { nowIso } from '../../ops/mappers';

export interface MemoryEventRow {
  id: number;
  action: string;
  actor: string;
  createdAt: string;
}

/**
 * v2.26 记忆审计流水：create/merge/update/supersede/archive/restore/delete。
 * 审计写入与主写入同事务（由 memory-repo 在事务内调用），失败可随主写入一起回滚。
 */
export function createMemoryEventRepository(db: DatabaseInstance) {
  return {
    record(
      memoryId: number,
      action: string,
      before: unknown,
      after: unknown,
      actor = 'system',
    ): void {
      db.prepare(
        `INSERT INTO memory_events(memory_id, action, before_json, after_json, actor, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        memoryId,
        action,
        before === null ? null : JSON.stringify(before),
        after === null ? null : JSON.stringify(after),
        actor,
        nowIso(),
      );
    },

    list(memoryId: string, limit = 20): MemoryEventRow[] {
      return db
        .prepare(
          `SELECT id, action, actor, created_at AS createdAt FROM memory_events
           WHERE memory_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`,
        )
        .all(Number(memoryId), limit) as MemoryEventRow[];
    },

    /** v2.28：全局最近审计（统计卡展示，不按记忆过滤） */
    listRecent(limit = 5): MemoryEventRow[] {
      return db
        .prepare(
          `SELECT id, action, actor, created_at AS createdAt FROM memory_events
           ORDER BY created_at DESC, id DESC LIMIT ?`,
        )
        .all(limit) as MemoryEventRow[];
    },

    /** v2.26 P2 线上计数：用户主动纠正（编辑/归档/恢复/删除）的审计条数 */
    countUserCorrections(): number {
      const live = db
        .prepare(
          `SELECT COUNT(*) AS n FROM memory_events
            WHERE actor = 'user' AND action IN ('update', 'archive', 'restore', 'delete')`,
        )
        .get() as { n: number };
      // v2.28：轮转后的过期事件已聚合，计数需加上存量聚合值，轮转前后数字不下降
      const rolled = db
        .prepare(
          `SELECT COALESCE(SUM(count), 0) AS n FROM memory_event_rollups
            WHERE actor = 'user' AND action IN ('update', 'archive', 'restore', 'delete')`,
        )
        .get() as { n: number };
      return live.n + rolled.n;
    },

    /**
     * v2.28 P1：单事务「聚合过期事件 → UPSERT 计数 → 删除原文」。
     * 聚合键为 (action, actor)，返回删除条数与聚合键数，供结构化日志核对。
     */
    rollupBefore(cutoff: string): { deleted: number; keys: number } {
      const run = db.transaction(() => {
        const groups = db
          .prepare(
            `SELECT action, actor, COUNT(*) AS n FROM memory_events
              WHERE created_at < ? GROUP BY action, actor`,
          )
          .all(cutoff) as Array<{ action: string; actor: string; n: number }>;
        if (groups.length === 0) return { deleted: 0, keys: 0 };
        const upsert = db.prepare(
          `INSERT INTO memory_event_rollups(action, actor, count) VALUES (?, ?, ?)
           ON CONFLICT(action, actor) DO UPDATE SET count = count + excluded.count`,
        );
        for (const group of groups) upsert.run(group.action, group.actor, group.n);
        const deleted = db
          .prepare(`DELETE FROM memory_events WHERE created_at < ?`)
          .run(cutoff).changes;
        return { deleted, keys: groups.length };
      });
      return run();
    },

    deleteAll(): void {
      db.transaction(() => {
        db.prepare(`DELETE FROM memory_events`).run();
        db.prepare(`DELETE FROM memory_event_rollups`).run();
      })();
    },
  };
}

export type MemoryEventRepository = ReturnType<typeof createMemoryEventRepository>;
