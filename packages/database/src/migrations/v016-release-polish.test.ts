import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyMigrations, getSchemaVersion, LATEST_SCHEMA_VERSION } from './runner';
import { migrateV016 } from './v016-release-polish';

const SETTINGS_KEY = 'app-settings';

/** 全新空库（全量迁移到最新） */
function createEmptyDatabase(): Database.Database {
  const db = new Database(':memory:');
  applyMigrations(db);
  return db;
}

/** 停在 v15 的库（在最新库上降版本；v016 仅改设置数据，无需撤表） */
function createV15Database(): Database.Database {
  const db = new Database(':memory:');
  applyMigrations(db);
  db.prepare(`DELETE FROM settings_kv WHERE key = ?`).run(SETTINGS_KEY);
  db.pragma('user_version = 15');
  return db;
}

function readAppSettings(db: Database.Database): Record<string, unknown> | undefined {
  const row = db.prepare(`SELECT value FROM settings_kv WHERE key = ?`).get(SETTINGS_KEY) as
    | { value: string }
    | undefined;
  return row ? (JSON.parse(row.value) as Record<string, unknown>) : undefined;
}

describe('v016 迁移：老用户首启向导标记回填', () => {
  it('全新空库升级：不写 app-settings（首启由读取默认值弹向导）', () => {
    const db = createEmptyDatabase();
    // v017 已接入后，全量迁移终点为 17；v016 自身行为（不写 settings）仍成立
    expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    expect(LATEST_SCHEMA_VERSION).toBeGreaterThanOrEqual(16);
    expect(readAppSettings(db)).toBeUndefined();
  });

  it('老库已有 app-settings：补 hasOnboarded=true 且保留原字段', () => {
    const db = createV15Database();
    db.prepare(
      `INSERT INTO settings_kv(key, value, updated_at) VALUES(?, ?, '2026-10-01T00:00:00.000Z')`,
    ).run(SETTINGS_KEY, JSON.stringify({ theme: 'dark', language: 'zh-CN' }));

    applyMigrations(db);

    expect(readAppSettings(db)).toMatchObject({
      theme: 'dark',
      language: 'zh-CN',
      hasOnboarded: true,
    });
  });

  it('老库无设置但有会话：创建 app-settings 并标记 hasOnboarded=true', () => {
    const db = createV15Database();
    db.prepare(
      `INSERT INTO assistants(id, name, created_at, updated_at) VALUES('a1','助手','2026-10-01','2026-10-01')`,
    ).run();
    db.prepare(
      `INSERT INTO conversations(id, assistant_id, created_at, updated_at)
       VALUES('c1','a1','2026-10-01','2026-10-01')`,
    ).run();

    applyMigrations(db);

    expect(readAppSettings(db)).toEqual({ hasOnboarded: true });
  });

  it('幂等：已显式带 hasOnboarded 的行不被覆盖（含 false 合法态）', () => {
    const dbFalse = createV15Database();
    dbFalse.prepare(
      `INSERT INTO settings_kv(key, value, updated_at) VALUES(?, ?, 't')`,
    ).run(SETTINGS_KEY, JSON.stringify({ hasOnboarded: false }));
    applyMigrations(dbFalse);
    expect(readAppSettings(dbFalse)).toEqual({ hasOnboarded: false });

    // 直接重跑迁移函数也不报错、不重复写
    expect(() => migrateV016(dbFalse)).not.toThrow();
    expect(readAppSettings(dbFalse)).toEqual({ hasOnboarded: false });
  });

  it('app-settings JSON 损坏但有其他设置行时，以 hasOnboarded=true 重建该行', () => {
    const db = createV15Database();
    db.prepare(`INSERT INTO settings_kv(key, value, updated_at) VALUES('other','"v"','t')`).run();
    db.prepare(`INSERT INTO settings_kv(key, value, updated_at) VALUES(?, '{broken', 't')`).run(
      SETTINGS_KEY,
    );

    applyMigrations(db);

    expect(readAppSettings(db)).toEqual({ hasOnboarded: true });
  });
});
