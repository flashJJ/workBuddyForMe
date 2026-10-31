import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyMigrations, getSchemaVersion, LATEST_SCHEMA_VERSION } from './runner';

describe('v041 迁移：Agent 治理底座', () => {
  it('全新库：task_runs 四列与 audit_events 就位', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(42);
    expect(LATEST_SCHEMA_VERSION).toBe(42);

    const columns = db.prepare('PRAGMA table_info(task_runs)').all() as Array<{ name: string }>;
    const names = columns.map((column) => column.name);
    for (const column of [
      'permission_mode',
      'workspace_path',
      'policy_snapshot_json',
      'origin_scheduled_task_id',
    ]) {
      expect(names).toContain(column);
    }

    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
      .all() as Array<{ name: string }>;
    expect(tables.map((row) => row.name)).toContain('audit_events');
    db.close();
  });

  it('v040 旧库升级：既有运行默认每次确认，数据不丢', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = OFF');
    applyMigrations(db, 40);
    db.prepare(
      `INSERT INTO task_runs
         (id, conversation_id, assistant_id, goal, status, step_count, failure_count,
          max_steps, stop_reason, created_at, updated_at, finished_at)
       VALUES ('run-old', 'conv-old', '', '旧任务', 'completed', 1, 0,
               20, NULL, 't', 't', NULL)`,
    ).run();

    const result = applyMigrations(db);
    expect(result.applied).toEqual([41, 42]);
    expect(getSchemaVersion(db)).toBe(42);
    const row = db
      .prepare(
        'SELECT permission_mode, workspace_path, origin_scheduled_task_id FROM task_runs WHERE id = ?',
      )
      .get('run-old') as {
      permission_mode: string;
      workspace_path: string | null;
      origin_scheduled_task_id: string | null;
    };
    expect(row).toEqual({
      permission_mode: 'confirm_each',
      workspace_path: null,
      origin_scheduled_task_id: null,
    });
    db.close();
  });

  it('重复迁移幂等，审计表可写', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    expect(applyMigrations(db).applied).toEqual([]);
    db.prepare(
      `INSERT INTO audit_events(id, seq, created_at, kind, actor, prev_hash, hash)
       VALUES ('a1', 1, 't', 'policy_updated', 'user', 'GENESIS', 'h1')`,
    ).run();
    expect((db.prepare('SELECT count(*) AS n FROM audit_events').get() as { n: number }).n).toBe(1);
    db.close();
  });
});
