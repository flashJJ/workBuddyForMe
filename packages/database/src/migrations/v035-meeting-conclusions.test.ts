import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyMigrations, getSchemaVersion, LATEST_SCHEMA_VERSION } from './runner';

describe('v035 迁移：meeting_conclusions + meeting_action_items', () => {
  it('全新空库：user_version=latest，两张表与索引就位', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    expect(LATEST_SCHEMA_VERSION).toBe(42);
    for (const table of ['meeting_conclusions', 'meeting_action_items']) {
      const rows = db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
        .all(table) as Array<{ name: string }>;
      expect(rows).toHaveLength(1);
    }
    const idx = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='index' AND name='idx_meeting_action_items'`,
      )
      .all() as Array<{ name: string }>;
    expect(idx).toHaveLength(1);
    db.close();
  });

  it('默认值与约束：status/source 只允许枚举值', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    db.prepare(
      `INSERT INTO meeting_action_items(id,meeting_id,content,created_at,updated_at)
       VALUES('i1','m1','行动项','t','t')`,
    ).run();
    const row = db
      .prepare(`SELECT status, source FROM meeting_action_items WHERE id='i1'`)
      .get() as { status: string; source: string };
    expect(row).toEqual({ status: 'open', source: 'generated' });

    expect(() =>
      db
        .prepare(
          `INSERT INTO meeting_action_items(id,meeting_id,content,status,created_at,updated_at)
           VALUES('i2','m1','非法','deleted','t','t')`,
        )
        .run(),
    ).toThrow(/CHECK/);
    db.close();
  });

  it('幂等：重复执行不报错，已有数据不受影响', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    db.prepare(
      `INSERT INTO meeting_conclusions(meeting_id,summary,generated_at)
       VALUES('m1','结论','t')`,
    ).run();
    expect(() => applyMigrations(db)).not.toThrow();
    expect(
      (db.prepare(`SELECT COUNT(*) AS n FROM meeting_conclusions`).get() as { n: number }).n,
    ).toBe(1);
    db.close();
  });
});
