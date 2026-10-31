import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyMigrations, getSchemaVersion, LATEST_SCHEMA_VERSION } from './runner';

describe('v039 迁移：能力包登记表', () => {
  it('全新空库：capability_packs 就位', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    expect(LATEST_SCHEMA_VERSION).toBe(41);
    const table = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='capability_packs'`)
      .get() as { name: string } | undefined;
    expect(table?.name).toBe('capability_packs');
    db.close();
  });

  it('行可写且 id 主键；重复迁移幂等', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    db.prepare(
      `INSERT INTO capability_packs(
         id, kind, version, name, description, permissions_json, manifest_json,
         status, effect_ref, last_error, installed_at, updated_at)
       VALUES ('com.test','skill','1.0.0','测试','','[]','{}','disabled',NULL,NULL,'t','t')`,
    ).run();
    expect(() => applyMigrations(db)).not.toThrow();
    expect(
      (db.prepare(`SELECT count(*) AS n FROM capability_packs`).get() as { n: number }).n,
    ).toBe(1);
    db.close();
  });
});
