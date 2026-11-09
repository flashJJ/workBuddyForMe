import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyMigrations, getSchemaVersion, LATEST_SCHEMA_VERSION } from './runner';

describe('v031 mod_installs', () => {
  it('空库迁移到最新版本', () => {
    const db = new Database(':memory:');
    const result = applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    expect(result.applied).toContain(31);
    const table = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='mod_installs'",
    ).get();
    expect(table).toBeTruthy();
    db.close();
  });

  it('v30 库增量迁移', () => {
    const db = new Database(':memory:');
    db.pragma('user_version = 30');
    applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    const cols = db.prepare('PRAGMA table_info(mod_installs)').all() as Array<{ name: string }>;
    expect(cols.map((c) => c.name)).toEqual([
      'id',
      'pack_id',
      'name',
      'pack_version',
      'author_name',
      'imported_at',
      'summary_json',
    ]);
    db.close();
  });

  it('重复迁移幂等', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    db.close();
  });
});
