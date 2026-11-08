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

function columns(db: Database.Database, table: string): Set<string> {
  return new Set(
    (
      db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
    ).map((row) => row.name),
  );
}

describe('v046 迁移：记忆生命周期', () => {
  it('全新库：版本 46、生命周期列/审计表/全文表就位', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(46);
    expect(LATEST_SCHEMA_VERSION).toBe(46);

    const cols = columns(db, 'memories');
    for (const name of [
      'scope',
      'assistant_id',
      'source',
      'pinned',
      'confidence',
      'subject_key',
      'version',
      'superseded_by',
      'valid_from',
      'valid_to',
      'ttl_at',
      'last_confirmed_at',
    ]) {
      expect(cols.has(name)).toBe(true);
    }
    expect(tables(db).has('memory_events')).toBe(true);
    expect(tables(db).has('memories_fts')).toBe(true);
    db.close();
  });

  it('旧库升级：45 → 46 保留旧记忆并回填默认值与全文索引', () => {
    const db = new Database(':memory:');
    applyMigrations(db, 45);
    db.prepare(
      `INSERT INTO memories(kind, content, importance, status, created_at, updated_at)
       VALUES ('fact', '用户住在杭州', 0.7, 'active', 't1', 't1')`,
    ).run();

    const result = applyMigrations(db);
    expect(result.applied).toEqual([46]);
    expect(getSchemaVersion(db)).toBe(46);

    const row = db.prepare(`SELECT * FROM memories`).get() as Record<string, unknown>;
    expect(row.scope).toBe('global');
    expect(row.source).toBe('legacy');
    expect(row.version).toBe(1);
    expect(row.pinned).toBe(0);
    expect(row.confidence).toBe(1);
    expect(row.last_confirmed_at).toBeNull();

    const fts = db.prepare(`SELECT memory_id FROM memories_fts`).all() as Array<{
      memory_id: number;
    }>;
    expect(fts).toEqual([{ memory_id: 1 }]);
    db.close();
  });

  it('审计表可追加并可按记忆倒序查询', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    const insert = db.prepare(
      `INSERT INTO memory_events(memory_id, action, before_json, after_json, created_at)
       VALUES (?, ?, NULL, ?, ?)`,
    );
    insert.run(1, 'create', '{"content":"a"}', '2026-01-01T00:00:00.000Z');
    insert.run(1, 'merge', '{"content":"b"}', '2026-01-02T00:00:00.000Z');
    const rows = db
      .prepare(`SELECT action FROM memory_events WHERE memory_id = ? ORDER BY created_at DESC`)
      .all(1) as Array<{ action: string }>;
    expect(rows.map((r) => r.action)).toEqual(['merge', 'create']);
    db.close();
  });
});
