import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyMigrations, getSchemaVersion, LATEST_SCHEMA_VERSION } from './runner';

describe('v037 迁移：运行租约 / 完成回投 / 计划 / 定时跟进', () => {
  it('全新空库：user_version=latest，表与列就位', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    expect(LATEST_SCHEMA_VERSION).toBe(42);

    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table'
         AND name IN ('run_completions','conversation_goals','work_plans','work_plan_steps')`,
      )
      .all() as Array<{ name: string }>;
    expect(tables.map((row) => row.name).sort()).toEqual([
      'conversation_goals',
      'run_completions',
      'work_plan_steps',
      'work_plans',
    ]);

    for (const table of ['task_runs', 'agent_runs']) {
      const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
      expect(columns.map((column) => column.name)).toEqual(
        expect.arrayContaining(['lease_owner', 'lease_expires_at']),
      );
    }
    const scheduled = db.prepare(`PRAGMA table_info(scheduled_tasks)`).all() as Array<{
      name: string;
    }>;
    expect(scheduled.map((column) => column.name)).toContain('payload_json');
    db.close();
  });

  it('计划表可写入并读取步骤进度', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    const ts = '2026-10-29T00:00:00.000Z';
    db.prepare(
      `INSERT INTO work_plans(id, conversation_id, kind, title, status, origin, created_at, updated_at)
       VALUES ('p1','c1','plan','复盘','draft','user',?,?)`,
    ).run(ts, ts);
    db.prepare(
      `INSERT INTO work_plan_steps(id, plan_id, step_index, title, status, note, updated_at)
       VALUES ('s1','p1',0,'收集','done','',?)`,
    ).run(ts);

    const step = db
      .prepare(`SELECT status FROM work_plan_steps WHERE id='s1'`)
      .get() as { status: string };
    expect(step.status).toBe('done');
    db.close();
  });

  it('幂等：重复执行不报错，已有数据保留', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    db.prepare(
      `INSERT INTO run_completions(run_id, kind, status, created_at) VALUES ('r1','task','completed','t')`,
    ).run();
    expect(() => applyMigrations(db)).not.toThrow();
    expect(
      (db.prepare(`SELECT status FROM run_completions WHERE run_id='r1'`).get() as { status: string })
        .status,
    ).toBe('completed');
    db.close();
  });
});
