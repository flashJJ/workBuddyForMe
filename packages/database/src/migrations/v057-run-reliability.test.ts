import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { createDatabase } from '../client';
import { createWorkflowRepository } from '../repositories/workflow/workflow-repo';
import { createWorkflowScheduleRepository } from '../repositories/workflow/workflow-schedule-repo';
import { applyMigrations, getSchemaVersion, LATEST_SCHEMA_VERSION } from './runner';

describe('v057 运行兜底', () => {
  it('迁移后版本 57，运行/定时/触发器新列与补偿表/索引存在', () => {
    const db = createDatabase(':memory:');
    expect(LATEST_SCHEMA_VERSION).toBe(58);
    expect(getSchemaVersion(db)).toBe(58);

    const runCols = db.prepare('PRAGMA table_info(workflow_runs)').all() as Array<{ name: string }>;
    expect(runCols.map((c) => c.name)).toEqual(
      expect.arrayContaining(['graph_snapshot_json', 'graph_hash', 'replay_batch_id']),
    );
    const scheduleCols = db
      .prepare('PRAGMA table_info(workflow_schedules)')
      .all() as Array<{ name: string }>;
    expect(scheduleCols.map((c) => c.name)).toEqual(
      expect.arrayContaining(['missed_count', 'last_missed_at']),
    );
    const triggerCols = db
      .prepare('PRAGMA table_info(workflow_triggers)')
      .all() as Array<{ name: string }>;
    expect(triggerCols.map((c) => c.name)).toContain('secret_cipher');

    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('flow_run_compensations','workflow_runs')",
      )
      .all();
    expect(tables).toHaveLength(2);
    const indexes = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name IN ('idx_workflow_runs_replay_batch','idx_flow_run_compensations_due','idx_flow_run_compensations_workflow')",
      )
      .all();
    expect(indexes).toHaveLength(3);
  });

  it('v56 旧行升级后保留，新列取默认值', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyMigrations(db, 56);
    const workflows = createWorkflowRepository(db);
    const schedules = createWorkflowScheduleRepository(db);
    const wf = workflows.createWorkflow({ name: '旧数据' });
    db.prepare(
      `INSERT INTO workflow_runs
         (id, workflow_id, version, trigger, status, input_json, created_at)
       VALUES ('run-old', ?, 1, 'manual', 'succeeded', NULL, 't0')`,
    ).run(wf.id);
    const schedule = schedules.create({
      workflowId: wf.id,
      name: '',
      cron: '0 9 * * *',
      timezone: 'Asia/Shanghai',
      enabled: true,
      nextRunAt: '2026-11-24T01:00:00.000Z',
    });
    db.prepare(
      `INSERT INTO workflow_triggers
         (id, workflow_id, kind, name, enabled, config_json, secret_hash, created_at, updated_at)
       VALUES ('trg-old', ?, 'webhook', '', 1, '{}', 'hash-old', 't0', 't0')`,
    ).run(wf.id);

    applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(58);

    const runRow = db.prepare('SELECT * FROM workflow_runs WHERE id = ?').get('run-old') as Record<
      string,
      unknown
    >;
    expect(runRow).toMatchObject({
      version: 1,
      graph_snapshot_json: null,
      graph_hash: null,
      replay_batch_id: null,
    });
    const scheduleRow = db
      .prepare('SELECT * FROM workflow_schedules WHERE id = ?')
      .get(schedule.id) as Record<string, unknown>;
    expect(scheduleRow).toMatchObject({ missed_count: 0, last_missed_at: null });
    const triggerRow = db
      .prepare('SELECT * FROM workflow_triggers WHERE id = ?')
      .get('trg-old') as Record<string, unknown>;
    expect(triggerRow).toMatchObject({ secret_hash: 'hash-old', secret_cipher: null });
  });
});
