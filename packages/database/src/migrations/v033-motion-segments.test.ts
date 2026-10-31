import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyMigrations, getSchemaVersion, LATEST_SCHEMA_VERSION } from './runner';
import { migrateV032 } from './v032-motion-assets';

describe('v033 motion_assets 动作段与档位', () => {
  it('空库迁移到最新版本', () => {
    const db = new Database(':memory:');
    const result = applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    expect(result.applied).toContain(33);
    db.close();
  });

  it('v32 库增量迁移：四列就位，且已存在的旧行降级为 single + normal + 无门槛', () => {
    const db = new Database(':memory:');
    // 先造出 v032 形状的表并写入一行「旧数据」（这一段在 v033 之前就存在）
    migrateV032(db);
    db.prepare(
      `INSERT INTO motion_assets (id, name, file_ref, byte_length)
       VALUES ('m-old', '旧动作', 'motion-old.vrma', 1024)`,
    ).run();
    db.pragma('user_version = 32');

    const result = applyMigrations(db);
    expect(result.applied).toEqual([33, 34, 35, 36, 37, 38, 39, 40, 41, 42]);
    expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);

    const cols = db.prepare('PRAGMA table_info(motion_assets)').all() as Array<{ name: string }>;
    expect(cols.map((c) => c.name)).toEqual([
      'id',
      'name',
      'file_ref',
      'byte_length',
      'source',
      'note',
      'created_at',
      'entry_key',
      'segment',
      'mood',
      'min_relationship_level',
    ]);

    // 旧行降级路径：整段即循环段、任何档位都可播、无关系门槛（与 v2.1 行为一致）
    const row = db
      .prepare('SELECT entry_key, segment, mood, min_relationship_level FROM motion_assets WHERE id = ?')
      .get('m-old') as {
      entry_key: string | null;
      segment: string;
      mood: string;
      min_relationship_level: number | null;
    };
    expect(row).toEqual({
      entry_key: null,
      segment: 'single',
      mood: 'normal',
      min_relationship_level: null,
    });
    db.close();
  });

  it('迁移可重复应用（幂等：已到 v33 再跑一次不报错、不重复加列）', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    const again = applyMigrations(db);
    expect(again.applied).toEqual([]);
    expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    db.close();
  });
});
