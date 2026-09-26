import type { DatabaseInstance } from '../client';
import type { Memory, MemoryKind, MemoryStatus } from '@wbfm/shared';
import { nowIso, mapMemory, type MemoryRow } from './mappers';

export interface MemoryAddFields {
  kind: MemoryKind;
  content: string;
  importance: number;
  sourceConversationId?: string | null;
  status?: MemoryStatus;
}

export interface MemoryUpdateFields {
  kind?: MemoryKind;
  content?: string;
  importance?: number;
  status?: MemoryStatus;
}

export interface MemoryListFilter {
  status?: MemoryStatus;
  kind?: MemoryKind;
  /** 列表/管理页搜索（content LIKE） */
  search?: string;
  limit?: number;
}

export function createMemoryRepository(db: DatabaseInstance) {
  return {
    add(fields: MemoryAddFields): Memory {
      const ts = nowIso();
      const result = db
        .prepare(
          `INSERT INTO memories
             (kind, content, importance, source_conversation_id, status,
              created_at, updated_at, last_accessed_at)
           VALUES
             (@kind, @content, @importance, @sourceConversationId, @status, @ts, @ts, NULL)`,
        )
        .run({
          kind: fields.kind,
          content: fields.content,
          importance: fields.importance,
          sourceConversationId: fields.sourceConversationId ?? null,
          status: fields.status ?? 'active',
          ts,
        });
      return this.findById(String(result.lastInsertRowid))!;
    },

    findById(id: string): Memory | null {
      const row = db.prepare(`SELECT * FROM memories WHERE id = ?`).get(Number(id)) as
        | MemoryRow
        | undefined;
      return row ? mapMemory(row) : null;
    },

    /** 管理页列表：默认 active 优先，新记忆在前 */
    list(filter: MemoryListFilter = {}): Memory[] {
      const where: string[] = [];
      const params: Record<string, unknown> = {};
      if (filter.status) {
        where.push('status = @status');
        params.status = filter.status;
      }
      if (filter.kind) {
        where.push('kind = @kind');
        params.kind = filter.kind;
      }
      if (filter.search?.trim()) {
        where.push('content LIKE @search');
        params.search = `%${filter.search.trim()}%`;
      }
      const sql = `SELECT * FROM memories ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
                   ORDER BY importance DESC, created_at DESC, id DESC LIMIT @limit`;
      const rows = db.prepare(sql).all({ ...params, limit: filter.limit ?? 200 }) as MemoryRow[];
      return rows.map(mapMemory);
    },

    update(id: string, fields: MemoryUpdateFields): Memory | null {
      const keys = Object.keys(fields) as (keyof MemoryUpdateFields)[];
      if (keys.length === 0) return this.findById(id);
      const columnMap: Record<keyof MemoryUpdateFields, string> = {
        kind: 'kind',
        content: 'content',
        importance: 'importance',
        status: 'status',
      };
      const assignments = keys.map((k) => `${columnMap[k]} = @${k}`).join(', ');
      db.prepare(
        `UPDATE memories SET ${assignments}, updated_at = @updatedAt WHERE id = @id`,
      ).run({ ...fields, updatedAt: nowIso(), id: Number(id) });
      return this.findById(id);
    },

    /** 召回命中后刷新访问时间（LRU/P1 衰减使用） */
    touchAccessed(ids: string[]): void {
      if (ids.length === 0) return;
      const ts = nowIso();
      const stmt = db.prepare(
        `UPDATE memories SET last_accessed_at = ? WHERE id = ?`,
      );
      const apply = db.transaction((items: string[]) => {
        for (const id of items) stmt.run(ts, Number(id));
      });
      apply(ids);
    },

    delete(id: string): boolean {
      return db.prepare(`DELETE FROM memories WHERE id = ?`).run(Number(id)).changes > 0;
    },

    /** 物理清空（记忆库「全部清空」二次确认后调用）；虚表由调用方同事务清理 */
    deleteAll(): number {
      return db.prepare(`DELETE FROM memories`).run().changes;
    },

    count(status?: MemoryStatus): number {
      const row = status
        ? (db
            .prepare(`SELECT COUNT(*) AS n FROM memories WHERE status = ?`)
            .get(status) as { n: number })
        : (db.prepare(`SELECT COUNT(*) AS n FROM memories`).get() as { n: number });
      return row.n;
    },
  };
}

export type MemoryRepository = ReturnType<typeof createMemoryRepository>;
