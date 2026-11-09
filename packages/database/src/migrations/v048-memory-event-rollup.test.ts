import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyMigrations, getSchemaVersion, LATEST_SCHEMA_VERSION } from './runner';

function tables(db: Database.Database): Set<string> {
  return new Set(
    (db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as Array<{
      name: string;
    }>).map((row) => row.name),
  );
}

function indexes(db: Database.Database): Set<string> {
  return new Set(
    (db.prepare(`SELECT name FROM sqlite_master WHERE type='index'`).all() as Array<{
      name: string;
    }>).map((row) => row.name),
  );
}

describe('v048 迁移：记忆审计轮转', () => {
  it('全新库：版本 49，聚合表与 created_at 索引就位', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(51);
    expect(LATEST_SCHEMA_VERSION).toBe(51);

    expect(tables(db).has('memory_event_rollups')).toBe(true);
    const columns = new Set(
      (db.prepare(`PRAGMA table_info(memory_event_rollups)`).all() as Array<{
        name: string;
      }>).map((row) => row.name),
    );
    expect(columns).toEqual(new Set(['action', 'actor', 'count']));
    expect(indexes(db).has('idx_memory_events_created')).toBe(true);
    db.close();
  });

  it('旧库升级：47 → 48 纯加法，存量审计事件不受影响', () => {
    const db = new Database(':memory:');
    applyMigrations(db, 47);
    db.prepare(
      `INSERT INTO memory_events(memory_id, action, before_json, after_json, actor, created_at)
       VALUES (1, 'update', NULL, NULL, 'user', '2026-01-01T00:00:00.000Z')`,
    ).run();

    const result = applyMigrations(db);
    expect(result.applied).toEqual([48, 49, 50, 51]);
    expect(getSchemaVersion(db)).toBe(51);
    expect(
      (db.prepare(`SELECT COUNT(*) AS n FROM memory_events`).get() as { n: number }).n,
    ).toBe(1);
    expect(
      (db.prepare(`SELECT COUNT(*) AS n FROM memory_event_rollups`).get() as { n: number }).n,
    ).toBe(0);
    db.close();
  });

  it('聚合表以 (action, actor) 为主键，重复写入可累加', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    const upsert = db.prepare(
      `INSERT INTO memory_event_rollups(action, actor, count) VALUES (?, ?, ?)
       ON CONFLICT(action, actor) DO UPDATE SET count = count + excluded.count`,
    );
    upsert.run('update', 'user', 2);
    upsert.run('update', 'user', 3);
    expect(
      (
        db
          .prepare(`SELECT count FROM memory_event_rollups WHERE action='update' AND actor='user'`)
          .get() as { count: number }
      ).count,
    ).toBe(5);
    db.close();
  });
});
