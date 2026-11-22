import type { DatabaseInstance } from '../../../client';
import type { Memory, MemoryStatus } from '@wbfm/shared/types';
import { nowIso } from '../../ops/mappers';
import { createMemoryEventRepository, type MemoryEventRow } from './memory-event-repo';
import { createMemoryLifecycleRepository } from './memory-lifecycle-repo';
import { createMemorySearchRepository } from './memory-search-repo';
import {
  toNumberOrNull,
  type MemoryAddFields,
  type MemoryUpdateFields,
} from './memory-repo-types';

export function createMemoryRepository(db: DatabaseInstance) {
  const events = createMemoryEventRepository(db);
  const lifecycle = createMemoryLifecycleRepository(db);
  const search = createMemorySearchRepository(db);

  return {
    ...lifecycle,
    ...search,
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

    /** v4.21：当前生效的固定记忆数（统计卡） */
    countPinned(): number {
      const row = db
        .prepare(`SELECT COUNT(*) AS n FROM memories WHERE status = 'active' AND pinned = 1`)
        .get() as { n: number };
      return row.n;
    },

    /** v4.21：治理动作次数（在线事件 + 已轮转聚合） */
    countGovernance(action: 'merge' | 'downweight'): number {
      return events.countByAction(action, 'user');
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

    /** v4.12：按状态列出 id（供服务层清理边/FTS/向量） */
    listIdsByStatus(status: MemoryStatus): number[] {
      const rows = db
        .prepare(`SELECT id FROM memories WHERE status = ?`)
        .all(status) as Array<{ id: number }>;
      return rows.map((row) => row.id);
    },

    /** v4.12：按状态删除审计事件（须在删除主表前调用） */
    deleteEventsByStatus(status: MemoryStatus): number {
      return db
        .prepare(
          `DELETE FROM memory_events
             WHERE memory_id IN (SELECT id FROM memories WHERE status = ?)`,
        )
        .run(status).changes;
    },

    /** v4.12：按状态物理删除主表（边/FTS/向量由服务层同事务清理） */
    deleteByStatus(status: MemoryStatus): number {
      return db.prepare(`DELETE FROM memories WHERE status = ?`).run(status).changes;
    },
  };
}

export type MemoryRepository = ReturnType<typeof createMemoryRepository>;
