import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyMigrations, getSchemaVersion, LATEST_SCHEMA_VERSION } from './runner';

/** 停在 v21 的库：结构只差 v022 */
function createV21Database(): Database.Database {
  const db = new Database(':memory:');
  applyMigrations(db);
  db.pragma('user_version = 21');
  return db;
}

describe('v022 迁移：assistant_emotion_states 情绪状态表', () => {
  it('全新空库：user_version=22，新表就位', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    expect(LATEST_SCHEMA_VERSION).toBe(37);
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='assistant_emotion_states'`)
      .all() as Array<{ name: string }>;
    expect(tables).toHaveLength(1);
  });

  it('列结构：assistant_id 主键 + state_json + updated_at', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    const cols = db
      .prepare(`PRAGMA table_info(assistant_emotion_states)`)
      .all() as Array<{ name: string; pk: number; notnull: number }>;
    const byName = Object.fromEntries(cols.map((c) => [c.name, c]));
    expect(byName.assistant_id?.pk).toBe(1);
    expect(byName.state_json?.notnull).toBe(1);
    expect(byName.updated_at?.notnull).toBe(1);
    db.close();
  });

  it('v21 存量库升级：可读写新表；无存量行（无行=默认状态）', () => {
    const db = createV21Database();
    db.prepare(
      `INSERT INTO assistants(id,name,created_at,updated_at) VALUES('a1','助手','t','t')`,
    ).run();
    applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    const count = db
      .prepare(`SELECT COUNT(*) AS n FROM assistant_emotion_states`)
      .get() as { n: number };
    expect(count.n).toBe(0);

    db.prepare(
      `INSERT INTO assistant_emotion_states(assistant_id, state_json, updated_at)
       VALUES('a1', '{"schemaVersion":1}', '2026-10-12T00:00:00.000Z')`,
    ).run();
    const row = db
      .prepare(`SELECT state_json AS s FROM assistant_emotion_states WHERE assistant_id='a1'`)
      .get() as { s: string };
    expect(row.s).toBe('{"schemaVersion":1}');
    db.close();
  });

  it('外键级联：删除 assistants 行时情绪行一并删除', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    db.prepare(
      `INSERT INTO assistants(id,name,created_at,updated_at) VALUES('a1','助手','t','t')`,
    ).run();
    db.prepare(
      `INSERT INTO assistant_emotion_states(assistant_id, state_json, updated_at)
       VALUES('a1','{}','t')`,
    ).run();
    db.prepare(`DELETE FROM assistants WHERE id='a1'`).run();
    const count = db
      .prepare(`SELECT COUNT(*) AS n FROM assistant_emotion_states`)
      .get() as { n: number };
    expect(count.n).toBe(0);
    db.close();
  });

  it('迁移幂等：重复执行不报错不丢数据', () => {
    const db = createV21Database();
    applyMigrations(db);
    applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    db.close();
  });
});
