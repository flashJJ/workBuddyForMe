import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyMigrations, getSchemaVersion, LATEST_SCHEMA_VERSION } from './runner';
import { migrateV052 } from './v052-vrm-voice';

function createV51Database(): Database.Database {
  const db = new Database(':memory:');
  applyMigrations(db, 51);
  db.prepare(
    `INSERT INTO vrm_avatars(id, name, file_ref, byte_length, meta_json)
     VALUES ('a1', '测试模型', 'vrm-test.vrm', 128, '{}')`,
  ).run();
  return db;
}

describe('v052 vrm_avatars.voice_sid', () => {
  it('v51 库增量迁移后新增可空列，旧记录保持 NULL', () => {
    const db = createV51Database();
    const result = applyMigrations(db);

    expect(result.applied).toEqual([52]);
    expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    expect(LATEST_SCHEMA_VERSION).toBe(52);

    const columns = db.prepare('PRAGMA table_info(vrm_avatars)').all() as Array<{ name: string }>;
    expect(columns.map((column) => column.name)).toContain('voice_sid');

    const row = db.prepare('SELECT voice_sid FROM vrm_avatars WHERE id = ?').get('a1') as {
      voice_sid: number | null;
    };
    expect(row.voice_sid).toBeNull();

    db.prepare('UPDATE vrm_avatars SET voice_sid = ? WHERE id = ?').run(18, 'a1');
    const updated = db.prepare('SELECT voice_sid FROM vrm_avatars WHERE id = ?').get('a1') as {
      voice_sid: number | null;
    };
    expect(updated.voice_sid).toBe(18);
    db.close();
  });

  it('重复执行迁移函数幂等', () => {
    const db = createV51Database();
    expect(() => migrateV052(db)).not.toThrow();
    expect(() => migrateV052(db)).not.toThrow();
    db.close();
  });
});
