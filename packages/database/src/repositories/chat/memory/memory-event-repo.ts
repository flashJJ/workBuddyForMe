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
      const row = db
        .prepare(
          `SELECT COUNT(*) AS n FROM memory_events
            WHERE actor = 'user' AND action IN ('update', 'archive', 'restore', 'delete')`,
        )
        .get() as { n: number };
      return row.n;
    },

    deleteAll(): void {
      db.prepare(`DELETE FROM memory_events`).run();
    },
  };
}

export type MemoryEventRepository = ReturnType<typeof createMemoryEventRepository>;
