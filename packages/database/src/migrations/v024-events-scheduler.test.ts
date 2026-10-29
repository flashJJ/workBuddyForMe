import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyMigrations, getSchemaVersion, LATEST_SCHEMA_VERSION } from './runner';

/** 停在 v23 的库（表结构只欠 v024；helper 与既有迁移测试同口径） */
function createV23Database(): Database.Database {
  const db = new Database(':memory:');
  applyMigrations(db);
  db.pragma('user_version = 23');
  return db;
}

describe('v024 迁移：人格列 + scheduled_tasks + event_usage', () => {
  it('全新空库：user_version=24，两新表就位', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    expect(LATEST_SCHEMA_VERSION).toBe(40);
    for (const table of ['scheduled_tasks', 'event_usage']) {
      const rows = db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
        .all(table) as Array<{ name: string }>;
      expect(rows).toHaveLength(1);
    }
    db.close();
  });

  it('assistants 新增 4 人格列，老行默认 0.5', () => {
    const db = createV23Database();
    db.prepare(
      `INSERT INTO assistants(id,name,created_at,updated_at) VALUES('a1','助手','t','t')`,
    ).run();
    applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);

    const cols = db.prepare(`PRAGMA table_info(assistants)`).all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    for (const col of [
      'personality_frankness',
      'personality_tsundere',
      'personality_shy',
      'personality_tolerance',
    ]) {
      expect(names).toContain(col);
    }

    const row = db
      .prepare(
        `SELECT personality_frankness AS f, personality_tsundere AS t,
                personality_shy AS s, personality_tolerance AS tol FROM assistants WHERE id='a1'`,
      )
      .get() as { f: number; t: number; s: number; tol: number };
    expect(row).toEqual({ f: 0.5, t: 0.5, s: 0.5, tol: 0.5 });

    // 显式权重可写
    db.prepare(
      `UPDATE assistants SET personality_tsundere=0.8 WHERE id='a1'`,
    ).run();
    const updated = db
      .prepare(`SELECT personality_tsundere AS t FROM assistants WHERE id='a1'`)
      .get() as { t: number };
    expect(updated.t).toBe(0.8);
    db.close();
  });

  it('新表约束/索引可用：提醒 CRUD 与流水追加', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    db.prepare(
      `INSERT INTO assistants(id,name,created_at,updated_at) VALUES('a1','助手','t','t')`,
    ).run();

    db.prepare(
      `INSERT INTO scheduled_tasks(
         id, assistant_id, kind, hour, minute, weekday, at_date, timezone, text,
         enabled, next_run_at, created_at, updated_at)
       VALUES ('s1','a1','daily',9,30,NULL,NULL,'Asia/Shanghai','喝水',
               1,'2026-10-14T01:30:00.000Z','t','t')`,
    ).run();
    const due = db
      .prepare(
        `SELECT id FROM scheduled_tasks WHERE enabled=1 AND next_run_at <= ?`,
      )
      .all('2026-10-14T02:00:00.000Z') as Array<{ id: string }>;
    expect(due.map((r) => r.id)).toEqual(['s1']);

    db.prepare(
      `INSERT INTO event_usage(id, assistant_id, event_id, date_key, played_at, outcome, priority)
       VALUES ('u1','a1','ev.greeting.morning','2026-10-14','2026-10-14T01:00:00.000Z','played',1)`,
    ).run();
    const count = db
      .prepare(
        `SELECT COUNT(*) AS n FROM event_usage
          WHERE assistant_id='a1' AND event_id=? AND date_key=? AND outcome='played'`,
      )
      .get('ev.greeting.morning', '2026-10-14') as { n: number };
    expect(count.n).toBe(1);

    // CHECK 约束拒绝非法枚举
    expect(() =>
      db.prepare(
        `INSERT INTO event_usage(id, assistant_id, event_id, date_key, played_at, outcome, priority)
         VALUES ('u2','a1','ev.x','d','t','bogus',1)`,
      ).run(),
    ).toThrow();
    db.close();
  });

  it('迁移幂等：在已含新列/新表的库上重复执行不报错', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    expect(() => applyMigrations(db)).not.toThrow();
    expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    db.close();
  });
});
