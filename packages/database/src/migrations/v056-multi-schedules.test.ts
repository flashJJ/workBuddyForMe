import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { createDatabase } from '../client';
import { createWorkflowRepository } from '../repositories/workflow/workflow-repo';
import { createWorkflowScheduleRepository } from '../repositories/workflow/workflow-schedule-repo';
import { applyMigrations, getSchemaVersion, LATEST_SCHEMA_VERSION } from './runner';

describe('v056 一流程多定时', () => {
  it('迁移后表含 name/timezone，UNIQUE 消失，双索引存在', () => {
    const db = createDatabase(':memory:');
    expect(LATEST_SCHEMA_VERSION).toBeGreaterThanOrEqual(56);

    const columns = db.prepare('PRAGMA table_info(workflow_schedules)').all() as Array<{ name: string }>;
    expect(columns.map((c) => c.name)).toEqual(
      expect.arrayContaining(['workflow_id', 'name', 'cron', 'timezone', 'enabled', 'next_run_at']),
    );
    const indexes = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name IN ('idx_workflow_schedules_due','idx_workflow_schedules_workflow')",
      )
      .all();
    expect(indexes).toHaveLength(2);

    const wf = createWorkflowRepository(db).createWorkflow({ name: '多定时' });
    const insert = db.prepare(
      `INSERT INTO workflow_schedules
         (id, workflow_id, name, cron, timezone, enabled, input_json, next_run_at, created_at, updated_at)
       VALUES (?, ?, '', '* * * * *', 'Asia/Shanghai', 1, NULL, 't', 't', 't')`,
    );
    insert.run('s1', wf.id);
    expect(() => insert.run('s2', wf.id)).not.toThrow();
  });

  it('v55 旧行升级后保留，时区回填 Asia/Shanghai', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyMigrations(db, 55);
    const wf = createWorkflowRepository(db).createWorkflow({ name: '旧定时' });
    db.prepare(
      `INSERT INTO workflow_schedules
         (id, workflow_id, cron, enabled, input_json, next_run_at, last_run_at, last_run_id, last_status, created_at, updated_at)
       VALUES (@id, @workflowId, '0 9 * * *', 1, '{"topic":"周报"}', '2026-11-24T01:00:00.000Z',
               '2026-11-23T01:00:00.000Z', 'run-1', 'created', 't0', 't1')`,
    ).run({ id: 's-old', workflowId: wf.id });

    applyMigrations(db, 56);
    expect(getSchemaVersion(db)).toBe(56);
    const row = db.prepare('SELECT * FROM workflow_schedules WHERE id = ?').get('s-old') as Record<
      string,
      unknown
    >;
    expect(row).toMatchObject({
      workflow_id: wf.id,
      name: '',
      timezone: 'Asia/Shanghai',
      cron: '0 9 * * *',
      input_json: '{"topic":"周报"}',
      next_run_at: '2026-11-24T01:00:00.000Z',
      last_status: 'created',
      created_at: 't0',
      updated_at: 't1',
    });
  });

  it('删除流程级联清理全部定时', () => {
    const db = createDatabase(':memory:');
    const workflows = createWorkflowRepository(db);
    const schedules = createWorkflowScheduleRepository(db);
    const wf = workflows.createWorkflow({ name: '级联' });
    for (const cron of ['0 9 * * *', '0 22 * * *']) {
      schedules.create({
        workflowId: wf.id,
        name: '',
        cron,
        timezone: 'Asia/Shanghai',
        enabled: true,
        nextRunAt: '2026-11-24T01:00:00.000Z',
      });
    }
    expect(schedules.countByWorkflow(wf.id)).toBe(2);
    workflows.deleteWorkflow(wf.id);
    expect(schedules.countByWorkflow(wf.id)).toBe(0);
  });
});
