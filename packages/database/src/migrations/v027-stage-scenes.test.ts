import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyMigrations, getSchemaVersion, LATEST_SCHEMA_VERSION } from './runner';

describe('v027 迁移：stage_scenes', () => {
  it('全新空库：user_version=28，stage_scenes 就位', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    expect(LATEST_SCHEMA_VERSION).toBe(38);
    const rows = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='stage_scenes'`)
      .all() as Array<{ name: string }>;
    expect(rows).toHaveLength(1);
    db.close();
  });

  it('停在 v26 的老库可平滑升级到最新，老表不受影响', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    db.pragma('user_version = 26');
    // 老库存在 v026 的角色卡表
    expect(
      (
        db
          .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='character_cards'`)
          .all() as unknown[]
      ).length,
    ).toBe(1);

    applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    expect(
      (
        db
          .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='stage_scenes'`)
          .all() as unknown[]
      ).length,
    ).toBe(1);
    db.close();
  });

  it('幂等：重复执行迁移不报错且版本保持最新', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    expect(() => applyMigrations(db)).not.toThrow();
    expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    db.close();
  });

  it('is_builtin 默认 0，payload_json 可存取场景 JSON', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    const payload = JSON.stringify({
      background: { type: 'solid', color: '#101418', brightness: 1, blur: 0 },
      slots: {},
      cast: {},
      sceneZoom: 1,
      showDialog: true,
      showNameplates: true,
      warmFilter: { color: '#e8b06b', opacity: 0 },
    });
    db.prepare(
      `INSERT INTO stage_scenes(id,name,payload_json,created_at,updated_at) VALUES('s1','夜晚书房',@p,'t','t')`,
    ).run({ p: payload });
    const row = db
      .prepare(`SELECT name, is_builtin AS b, payload_json AS p FROM stage_scenes WHERE id='s1'`)
      .get() as { name: string; b: number; p: string };
    expect(row.b).toBe(0);
    expect(JSON.parse(row.p).background.color).toBe('#101418');
    db.close();
  });
});
