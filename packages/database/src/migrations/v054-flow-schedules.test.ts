import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { createWorkflowRepository } from '../repositories/workflow/workflow-repo';
import { applyMigrations, getSchemaVersion } from './runner';

/** 停在 v54 的历史库（迁移只前向，直接按目标版本构建） */
function createV54Database(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applyMigrations(db, 54);
  return db;
}

describe('v054 流程定时配置（历史版本）', () => {
  it('迁移到 54 后存在 workflow_schedules 与到期索引', () => {
    const db = createV54Database();
    expect(getSchemaVersion(db)).toBe(54);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='workflow_schedules'")
      .all();
    expect(tables).toHaveLength(1);
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_workflow_schedules_due'")
      .all();
    expect(indexes).toHaveLength(1);
    const columns = db.prepare('PRAGMA table_info(workflow_schedules)').all() as Array<{ name: string }>;
    expect(columns.map((c) => c.name)).toEqual(
      expect.arrayContaining(['workflow_id', 'cron', 'enabled', 'next_run_at', 'last_status']),
    );
  });

  it('v054 阶段一个流程只允许一条定时（v056 已放开）', () => {
    const db = createV54Database();
    const wf = createWorkflowRepository(db).createWorkflow({ name: '定时' });
    const insert = db.prepare(
      `INSERT INTO workflow_schedules
         (id, workflow_id, cron, enabled, input_json, next_run_at, created_at, updated_at)
       VALUES (?, ?, '* * * * *', 1, NULL, 't', 't', 't')`,
    );
    insert.run('s1', wf.id);
    expect(() => insert.run('s2', wf.id)).toThrow();
  });
});
