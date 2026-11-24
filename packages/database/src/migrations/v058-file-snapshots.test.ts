import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { createDatabase } from '../client';
import { createWorkflowRepository } from '../repositories/workflow/workflow-repo';
import { createWorkflowRunRepository } from '../repositories/workflow/workflow-run-repo';
import { applyMigrations, getSchemaVersion, LATEST_SCHEMA_VERSION } from './runner';

describe('v058 文件快照', () => {
  it('迁移后版本 58，快照表与三个索引存在', () => {
    const db = createDatabase(':memory:');
    expect(LATEST_SCHEMA_VERSION).toBe(58);
    expect(getSchemaVersion(db)).toBe(58);

    const columns = db
      .prepare('PRAGMA table_info(file_snapshots)')
      .all() as Array<{ name: string }>;
    expect(columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        'id',
        'run_id',
        'workflow_id',
        'node_id',
        'tool_name',
        'action',
        'path',
        'target_path',
        'existed_before',
        'byte_size',
        'sha256',
        'written_sha256',
        'blob_path',
        'truncated',
        'truncation_reason',
        'created_at',
      ]),
    );

    const indexes = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name IN ('idx_file_snapshots_run','idx_file_snapshots_created','idx_file_snapshots_path')",
      )
      .all();
    expect(indexes).toHaveLength(3);
  });

  it('v57 旧库升级后保留运行数据，新表可用', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyMigrations(db, 57);
    const workflows = createWorkflowRepository(db);
    const runs = createWorkflowRunRepository(db);
    const wf = workflows.createWorkflow({ name: '旧库' });
    const run = runs.createRun({ workflowId: wf.id, version: 1 });

    applyMigrations(db);
    expect(getSchemaVersion(db)).toBe(58);
    expect(runs.getRun(run.id)?.id).toBe(run.id);
    expect(
      (db.prepare('SELECT COUNT(*) AS n FROM file_snapshots').get() as { n: number }).n,
    ).toBe(0);
  });
});
