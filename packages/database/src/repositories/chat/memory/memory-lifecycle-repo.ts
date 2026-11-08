import type { Memory } from '@wbfm/shared/types';
import type { DatabaseInstance } from '../../../client';
import { mapMemory, nowIso, type MemoryRow } from '../../ops/mappers';
import { createMemoryEventRepository } from './memory-event-repo';

/**
 * v2.26 P2 记忆生命周期仓储：衰减扫描候选、批量软归档、TTL 到期归档。
 * 只归档（status=archived）不物理删除；每次归档逐条写 memory_events 审计，
 * 与状态更新同事务，便于管理页回溯。
 */

export function createMemoryLifecycleRepository(db: DatabaseInstance) {
  const events = createMemoryEventRepository(db);

  function archiveRows(rows: MemoryRow[], actor: string): number {
    if (rows.length === 0) return 0;
    const ts = nowIso();
    const update = db.prepare(
      `UPDATE memories SET status = 'archived', updated_at = @ts
        WHERE id = @id AND status = 'active'`,
    );
    return db.transaction(() => {
      let archived = 0;
      for (const row of rows) {
        if (update.run({ ts, id: row.id }).changes === 0) continue;
        const before = mapMemory(row);
        events.record(row.id, 'archive', before, { ...before, status: 'archived' }, actor);
        archived += 1;
      }
      return archived;
    })();
  }

  return {
    /** 衰减扫描：active、未置顶、非 constraint（硬约束永不衰减），按创建时间升序 */
    listDecayCandidates(limit: number): Memory[] {
      const rows = db
        .prepare(
          `SELECT * FROM memories
            WHERE status = 'active' AND pinned = 0 AND kind <> 'constraint'
            ORDER BY created_at ASC, id ASC LIMIT ?`,
        )
        .all(limit) as MemoryRow[];
      return rows.map(mapMemory);
    },

    /** 按 id 批量软归档（只归档不删除），逐条写 archive 审计 */
    archiveByIds(ids: string[], actor = 'system'): number {
      const numeric = ids.map(Number).filter((n) => Number.isInteger(n));
      if (numeric.length === 0) return 0;
      const rows = db
        .prepare(`SELECT * FROM memories WHERE id IN (${numeric.join(',')}) AND status = 'active'`)
        .all() as MemoryRow[];
      return archiveRows(rows, actor);
    },

    /** TTL 到期归档：临时事件/工作记忆状态到期即归档，写审计 */
    archiveExpired(now = nowIso(), actor = 'system'): number {
      const rows = db
        .prepare(
          `SELECT * FROM memories
            WHERE status = 'active' AND ttl_at IS NOT NULL AND ttl_at <= ?
            ORDER BY ttl_at ASC LIMIT 500`,
        )
        .all(now) as MemoryRow[];
      return archiveRows(rows, actor);
    },
  };
}

export type MemoryLifecycleRepository = ReturnType<typeof createMemoryLifecycleRepository>;
