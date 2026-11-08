import { describe, expect, it } from 'vitest';
import {
  createDatabase,
  createMemoryEventRepository,
  getMeta,
  type DatabaseInstance,
} from '@wbfm/database';
import { MEMORY_EVENT_ROLLUP_META_KEY } from '@wbfm/shared/constants';
import { readLastRollupAt, runMemoryEventRollup } from './memory-event-rollup';

function insertEvent(
  db: DatabaseInstance,
  action: string,
  actor: string,
  createdAt: string,
): void {
  db.prepare(
    `INSERT INTO memory_events(memory_id, action, before_json, after_json, actor, created_at)
     VALUES (1, ?, NULL, NULL, ?, ?)`,
  ).run(action, actor, createdAt);
}

describe('v2.28 P1 审计轮转', () => {
  it('默认 90 天：过期事件聚合后删除，用户纠正计数不下降', () => {
    const db = createDatabase(':memory:');
    const repo = createMemoryEventRepository(db);
    const now = new Date('2026-06-01T00:00:00.000Z');
    // 超过 90 天：两条 user 纠正 + 一条 system 写入
    insertEvent(db, 'update', 'user', '2026-01-01T00:00:00.000Z');
    insertEvent(db, 'archive', 'user', '2026-01-02T00:00:00.000Z');
    insertEvent(db, 'create', 'system', '2026-01-03T00:00:00.000Z');
    // 保留期内
    insertEvent(db, 'update', 'user', '2026-05-20T00:00:00.000Z');

    expect(repo.countUserCorrections()).toBe(3);
    const result = runMemoryEventRollup(db, { now });
    expect(result).toMatchObject({ skipped: false, deleted: 3, keys: 3 });
    expect(result.cutoff).toBe('2026-03-03T00:00:00.000Z');
    expect(repo.countUserCorrections()).toBe(3);
    expect(repo.listRecent(10)).toHaveLength(1);
    const grouped = db
      .prepare(`SELECT count FROM memory_event_rollups WHERE action='update' AND actor='user'`)
      .get() as { count: number };
    expect(grouped.count).toBe(1);
    expect(getMeta(db, MEMORY_EVENT_ROLLUP_META_KEY)).toBe(now.toISOString());
    expect(readLastRollupAt(db)).toBe(now.toISOString());
  });

  it('保留期可选 30 天：只清更早的事件', () => {
    const db = createDatabase(':memory:');
    const repo = createMemoryEventRepository(db);
    const now = new Date('2026-06-01T00:00:00.000Z');
    insertEvent(db, 'update', 'user', '2026-04-01T00:00:00.000Z');
    insertEvent(db, 'delete', 'user', '2026-05-20T00:00:00.000Z');

    const result = runMemoryEventRollup(db, { retentionDays: 30, now });
    expect(result.deleted).toBe(1);
    expect(repo.countUserCorrections()).toBe(2);
  });

  it('永久保留（0）：跳过轮转，不删除也不写时间戳', () => {
    const db = createDatabase(':memory:');
    const repo = createMemoryEventRepository(db);
    insertEvent(db, 'update', 'user', '2020-01-01T00:00:00.000Z');

    const result = runMemoryEventRollup(db, { retentionDays: 0 });
    expect(result).toMatchObject({ skipped: true, deleted: 0, keys: 0, cutoff: null });
    expect(repo.listRecent(10)).toHaveLength(1);
    expect(readLastRollupAt(db)).toBeNull();
  });

  it('清空记忆库时同步清空聚合计数', () => {
    const db = createDatabase(':memory:');
    const repo = createMemoryEventRepository(db);
    insertEvent(db, 'update', 'user', '2026-01-01T00:00:00.000Z');
    runMemoryEventRollup(db, { now: new Date('2026-06-01T00:00:00.000Z') });
    expect(repo.countUserCorrections()).toBe(1);

    repo.deleteAll();
    expect(repo.countUserCorrections()).toBe(0);
    expect(repo.listRecent(10)).toHaveLength(0);
  });
});
