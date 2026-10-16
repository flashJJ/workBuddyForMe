import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyMigrations, getSchemaVersion, LATEST_SCHEMA_VERSION } from './runner';

describe('v029 迁移：relationship_milestones 共同里程碑表', () => {
  it('全新空库：user_version=29，新表与唯一索引就位', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(31);
    expect(LATEST_SCHEMA_VERSION).toBe(31);
    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='relationship_milestones'`,
      )
      .all() as Array<{ name: string }>;
    expect(tables).toHaveLength(1);
    const indexes = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_milestone_unique'`)
      .all() as Array<{ name: string }>;
    expect(indexes).toHaveLength(1);
    db.close();
  });

  it('(assistant_id, milestone_key) 唯一：重复达成第二次写入被拒绝', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    db.prepare(
      `INSERT INTO assistants(id,name,created_at,updated_at) VALUES('a1','助手','t','t')`,
    ).run();
    const insert = db.prepare(
      `INSERT INTO relationship_milestones(id,assistant_id,milestone_key,achieved_at,payload_json)
       VALUES(?,?,?,?, '{}')`,
    );
    insert.run('x1', 'a1', 'day_1', '2026-10-15T00:00:00.000Z');
    expect(() =>
      insert.run('x2', 'a1', 'day_1', '2026-10-16T00:00:00.000Z'),
    ).toThrow();
    // 不同里程碑可并存
    insert.run('x3', 'a1', 'day_30', '2026-11-14T00:00:00.000Z');
    const count = db
      .prepare(`SELECT COUNT(*) AS n FROM relationship_milestones WHERE assistant_id='a1'`)
      .get() as { n: number };
    expect(count.n).toBe(2);
    db.close();
  });

  it('外键级联：删助手时里程碑一并删除', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    db.prepare(
      `INSERT INTO assistants(id,name,created_at,updated_at) VALUES('a1','助手','t','t')`,
    ).run();
    db.prepare(
      `INSERT INTO relationship_milestones(id,assistant_id,milestone_key,achieved_at,payload_json)
       VALUES('x1','a1','day_1','t','{}')`,
    ).run();
    db.prepare(`DELETE FROM assistants WHERE id='a1'`).run();
    const count = db
      .prepare(`SELECT COUNT(*) AS n FROM relationship_milestones`)
      .get() as { n: number };
    expect(count.n).toBe(0);
    db.close();
  });

  it('迁移幂等：重复执行不报错', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    expect(() => applyMigrations(db)).not.toThrow();
    expect(getSchemaVersion(db)).toBe(31);
    db.close();
  });
});
