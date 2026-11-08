import type { DatabaseInstance } from '../../../client';
import type { Memory, MemoryStatus } from '@wbfm/shared/types';
import { nowIso, mapMemory, type MemoryRow } from '../../ops/mappers';
import { createMemoryEventRepository, type MemoryEventRow } from './memory-event-repo';
import { createMemoryLifecycleRepository } from './memory-lifecycle-repo';
import {
  applyScope,
  dayBoundary,
  toNumberOrNull,
  type MemoryAddFields,
  type MemoryExactScope,
  type MemoryListFilter,
  type MemoryScopeFilter,
  type MemoryUpdateFields,
} from './memory-repo-types';

export function createMemoryRepository(db: DatabaseInstance) {
  const events = createMemoryEventRepository(db);
  const lifecycle = createMemoryLifecycleRepository(db);

  return {
    ...lifecycle,
    add(fields: MemoryAddFields): Memory {
      const ts = nowIso();
      const result = db
        .prepare(
          `INSERT INTO memories
             (kind, content, importance, source_conversation_id, source_message_id,
              status, created_at, updated_at, last_accessed_at, recall_count,
              scope, assistant_id, source, pinned, confidence, subject_key, version,
              valid_from, last_confirmed_at, ttl_at)
           VALUES
             (@kind, @content, @importance, @sourceConversationId, @sourceMessageId,
              @status, @ts, @ts, NULL, 0,
              @scope, @assistantId, @source, @pinned, @confidence, @subjectKey, @version,
              @validFrom, @lastConfirmedAt, @ttlAt)`,
        )
        .run({
          kind: fields.kind,
          content: fields.content,
          importance: fields.importance,
          sourceConversationId: fields.sourceConversationId ?? null,
          sourceMessageId: fields.sourceMessageId ?? null,
          status: fields.status ?? 'active',
          ts,
          scope: fields.scope ?? 'global',
          assistantId: fields.assistantId ?? null,
          source: fields.source ?? 'manual',
          pinned: fields.pinned ? 1 : 0,
          confidence: fields.confidence ?? 1,
          subjectKey: fields.subjectKey ?? null,
          version: fields.version ?? 1,
          validFrom: fields.validFrom ?? ts,
          lastConfirmedAt: fields.lastConfirmedAt ?? ts,
          ttlAt: fields.ttlAt ?? null,
        });
      return this.findById(String(result.lastInsertRowid))!;
    },

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

    update(id: string, fields: MemoryUpdateFields): Memory | null {
      const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
      if (entries.length === 0) return this.findById(id);
      const columnMap: Record<keyof MemoryUpdateFields, string> = {
        kind: 'kind',
        content: 'content',
        importance: 'importance',
        status: 'status',
        pinned: 'pinned',
        confidence: 'confidence',
        subjectKey: 'subject_key',
        version: 'version',
        supersededBy: 'superseded_by',
        validTo: 'valid_to',
        lastConfirmedAt: 'last_confirmed_at',
      };
      const assignments = entries
        .map(([key]) => `${columnMap[key as keyof MemoryUpdateFields]} = @${key}`)
        .join(', ');
      const payload: Record<string, unknown> = { updatedAt: nowIso(), id: Number(id) };
      for (const [key, value] of entries) {
        if (key === 'pinned') payload.pinned = value ? 1 : 0;
        else if (key === 'supersededBy') payload.supersededBy = toNumberOrNull(value as string | null);
        else payload[key] = value;
      }
      db.prepare(
        `UPDATE memories SET ${assignments}, updated_at = @updatedAt WHERE id = @id`,
      ).run(payload);
      return this.findById(id);
    },

    /**
     * v2.26 冲突取代：同一事务里插入新版本、关闭旧行区间并各写一条审计。
     * 旧行保留（status=superseded），历史可回溯；返回值含新旧两行。
     */
    supersede(oldId: string, fields: MemoryAddFields, actor = 'system'): {
      previous: Memory;
      next: Memory;
    } | null {
      const run = db.transaction(() => {
        const previous = this.findById(oldId);
        if (!previous) return null;
        const ts = nowIso();
        const next = this.add({ ...fields, version: (previous.version ?? 1) + 1 });
        db.prepare(
          `UPDATE memories
             SET status = 'superseded', valid_to = ?, superseded_by = ?, updated_at = ?
           WHERE id = ?`,
        ).run(ts, Number(next.id), ts, Number(oldId));
        events.record(Number(next.id), 'create', null, next, actor);
        events.record(
          Number(oldId),
          'supersede',
          previous,
          { ...previous, status: 'superseded', validTo: ts, supersededBy: next.id },
          actor,
        );
        return { previous: this.findById(oldId)!, next };
      });
      return run();
    },

    /** 审计流水：before/after 快照 JSON，与主写入同事务 */
    recordEvent(
      memoryId: number,
      action: string,
      before: unknown,
      after: unknown,
      actor = 'system',
    ): void {
      events.record(memoryId, action, before, after, actor);
    },

    listEvents(memoryId: string, limit = 20): MemoryEventRow[] {
      return events.list(memoryId, limit);
    },

    /** v2.26 P2 线上计数：用户主动纠正次数 */
    countUserCorrections(): number {
      return events.countUserCorrections();
    },

    /** 召回命中后刷新访问时间并累加召回次数（LRU/P1 衰减与溯源使用） */
    touchAccessed(ids: string[]): void {
      if (ids.length === 0) return;
      const ts = nowIso();
      const stmt = db.prepare(
        `UPDATE memories SET last_accessed_at = ?, recall_count = recall_count + 1 WHERE id = ?`,
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
      return db.transaction(() => {
        events.deleteAll();
        return db.prepare(`DELETE FROM memories`).run().changes;
      })();
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
