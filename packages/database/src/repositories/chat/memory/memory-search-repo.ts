import type { DatabaseInstance } from '../../../client';
import type { Memory, MemoryStatus } from '@wbfm/shared/types';
import { nowIso, mapMemory, type MemoryRow } from '../../ops/mappers';
import {
  applyScope,
  dayBoundary,
  type MemoryExactScope,
  type MemoryListFilter,
  type MemoryScopeFilter,
} from './memory-repo-types';

/**
 * v4.13 记忆只读查询仓储：按 id/主体/批量、置顶约束、管理页列表与计数。
 * 从 memory-repo 拆出，主仓储保留写入与审计；调用方仍在同一仓储对象上使用。
 */
export function createMemorySearchRepository(db: DatabaseInstance) {
  return {
    findById(id: string): Memory | null {
      const row = db.prepare(`SELECT * FROM memories WHERE id = ?`).get(Number(id)) as
        | MemoryRow
        | undefined;
      return row ? mapMemory(row) : null;
    },

    /** 同主体键、同精确作用域的 active 记忆（新版本在前），用于冲突判定 */
    findActiveBySubject(subjectKey: string, scope: MemoryExactScope): Memory[] {
      const where = ['subject_key = @subjectKey', `status = 'active'`, 'scope = @scope'];
      const params: Record<string, unknown> = { subjectKey, scope: scope.scope };
      if (scope.scope === 'assistant') {
        where.push('assistant_id = @assistantId');
        params.assistantId = scope.assistantId ?? null;
      } else if (scope.scope === 'conversation') {
        where.push('source_conversation_id = @conversationId');
        params.conversationId = scope.conversationId ?? null;
      }
      const rows = db
        .prepare(
          `SELECT * FROM memories WHERE ${where.join(' AND ')}
           ORDER BY version DESC, updated_at DESC LIMIT 5`,
        )
        .all(params) as MemoryRow[];
      return rows.map(mapMemory);
    },

    /** 召回候选：按 id 批量取 active 且未过 TTL 的记忆（作用域过滤） */
    findActiveByIds(ids: string[], filter?: MemoryScopeFilter, now = nowIso()): Memory[] {
      if (ids.length === 0) return [];
      const numeric = ids.map(Number).filter((n) => Number.isInteger(n));
      if (numeric.length === 0) return [];
      const where = [
        `id IN (${numeric.join(',')})`,
        `status = 'active'`,
        `(ttl_at IS NULL OR ttl_at > @now)`,
      ];
      const params: Record<string, unknown> = { now };
      applyScope(filter, where, params);
      const rows = db
        .prepare(`SELECT * FROM memories WHERE ${where.join(' AND ')}`)
        .all(params) as MemoryRow[];
      return rows.map(mapMemory);
    },

    /** 置顶硬约束：不依赖查询相似度，按最近确认时间取前 N 条 */
    listPinned(filter: MemoryScopeFilter | undefined, limit: number, now = nowIso()): Memory[] {
      const where = [
        `status = 'active'`,
        `pinned = 1`,
        `(ttl_at IS NULL OR ttl_at > @now)`,
      ];
      const params: Record<string, unknown> = { now, limit };
      applyScope(filter, where, params);
      const rows = db
        .prepare(
          `SELECT * FROM memories WHERE ${where.join(' AND ')}
           ORDER BY COALESCE(last_confirmed_at, created_at) DESC, id DESC LIMIT @limit`,
        )
        .all(params) as MemoryRow[];
      return rows.map(mapMemory);
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
      if (filter.createdAfter) {
        where.push('created_at >= @createdAfter');
        params.createdAfter = dayBoundary(filter.createdAfter, false);
      }
      if (filter.createdBefore) {
        where.push('created_at <= @createdBefore');
        params.createdBefore = dayBoundary(filter.createdBefore, true);
      }
      applyScope(filter.scope, where, params);
      const sql = `SELECT * FROM memories ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
                   ORDER BY importance DESC, created_at DESC, id DESC LIMIT @limit`;
      const rows = db.prepare(sql).all({ ...params, limit: filter.limit ?? 200 }) as MemoryRow[];
      return rows.map(mapMemory);
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

export type MemorySearchRepository = ReturnType<typeof createMemorySearchRepository>;
