import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyMigrations, getSchemaVersion, LATEST_SCHEMA_VERSION } from './runner';

describe('v032 motion_assets', () => {
  it('空库迁移到最新版本', () => {
    const db = new Database(':memory:');
    const result = applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    expect(result.applied).toContain(32);
    const table = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='motion_assets'",
    ).get();
    expect(table).toBeTruthy();
    db.close();
  });

  it('v31 库增量迁移', () => {
    const db = new Database(':memory:');
    db.pragma('user_version = 31');
    applyMigrations(db);
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
      // v033（v2.2 M0）纯加法补的四列
      'entry_key',
      'segment',
      'mood',
      'min_relationship_level',
    ]);
    db.close();
  });
});
