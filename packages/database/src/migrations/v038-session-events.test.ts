import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyMigrations, getSchemaVersion, LATEST_SCHEMA_VERSION } from './runner';

describe('v038 迁移：追加式事件日志 + CJK 全文索引', () => {
  it('全新空库：表、唯一索引与 FTS 就位', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    expect(LATEST_SCHEMA_VERSION).toBe(40);

    const table = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='session_events'`)
      .get() as { name: string } | undefined;
    expect(table?.name).toBe('session_events');
    const unique = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='index' AND name='idx_session_events_seq'`,
      )
      .get() as { name: string } | undefined;
    expect(unique?.name).toBe('idx_session_events_seq');
    const fts = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='session_events_fts'`,
      )
      .get() as { name: string } | undefined;
    expect(fts?.name).toBe('session_events_fts');
    db.close();
  });

  it('事件行可写；同 scope 重复 seq 被唯一索引拒绝；重复迁移幂等', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    const insert = db.prepare(
      `INSERT INTO session_events(id, scope, scope_id, seq, type, payload_json, schema_version, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
    );
    insert.run('e1', 'chat', 'c1', 1, 'message_started', '{}', 't');
    expect(() => insert.run('e2', 'chat', 'c1', 1, 'dup', '{}', 't')).toThrow();
    insert.run('e3', 'task', 't1', 1, 'run_started', '{}', 't');

    expect(() => applyMigrations(db)).not.toThrow();
    const rows = db.prepare(`SELECT COUNT(*) AS n FROM session_events`).get() as { n: number };
    expect(rows.n).toBe(2);
    db.close();
  });
});
