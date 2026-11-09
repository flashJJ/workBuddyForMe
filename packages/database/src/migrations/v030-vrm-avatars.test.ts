import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyMigrations, getSchemaVersion, LATEST_SCHEMA_VERSION } from './runner';

describe('v030 vrm_avatars', () => {
  it('空库迁移到最新版本', () => {
    const db = new Database(':memory:');
    const result = applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    expect(result.applied).toContain(30);
    const table = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='vrm_avatars'",
    ).get();
    expect(table).toBeTruthy();
    db.close();
  });

  it('v29 库增量迁移', () => {
    const db = new Database(':memory:');
    db.pragma('user_version = 29');
    applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    const cols = db.prepare('PRAGMA table_info(vrm_avatars)').all() as Array<{ name: string }>;
    expect(cols.map((c) => c.name)).toEqual(['id', 'name', 'file_ref', 'byte_length', 'meta_json', 'created_at']);
    const modTable = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='mod_installs'",
    ).get();
    expect(modTable).toBeTruthy();
    db.close();
  });
});
