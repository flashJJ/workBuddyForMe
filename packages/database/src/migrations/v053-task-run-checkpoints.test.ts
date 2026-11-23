import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyMigrations, getSchemaVersion, LATEST_SCHEMA_VERSION } from './runner';
import { migrateV053 } from './v053-task-run-checkpoints';

describe('v053 迁移：协作运行检查点', () => {
  it('v52 老库升级：检查点表与 resumed_from_run_id 列就位', () => {
    const db = new Database(':memory:');
    applyMigrations(db, 52);

    const result = applyMigrations(db);
    expect(result.applied).toEqual([53, 54, 55, 56]);
    expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    expect(LATEST_SCHEMA_VERSION).toBe(56);

    const table = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='task_run_checkpoints'")
      .get();
    expect(table).toBeTruthy();
    const columns = db.prepare('PRAGMA table_info(agent_runs)').all() as Array<{ name: string }>;
    expect(columns.map((column) => column.name)).toContain('resumed_from_run_id');
    db.close();
  });

  it('重复执行迁移函数幂等', () => {
    const db = new Database(':memory:');
    applyMigrations(db, 52);
    expect(() => migrateV053(db)).not.toThrow();
    expect(() => migrateV053(db)).not.toThrow();
    db.close();
  });
});
