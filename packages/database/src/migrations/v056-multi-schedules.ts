import type { Database } from 'better-sqlite3';

/**
 * v4.26 P1：一流程多定时（版本 56，重建表）。
 *
 * SQLite 无法直接删除 UNIQUE 约束，因此重建 workflow_schedules：
 * - 去掉 workflow_id UNIQUE；
 * - 新增 name（可读名称）与 timezone（IANA）；
 * - 旧行原样复制，时区回填 Asia/Shanghai，保持 v4.24 行为。
 */
export function migrateV056(db: Database): void {
  db.exec(`
    CREATE TABLE workflow_schedules_new (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT '',
      cron TEXT NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
      enabled INTEGER NOT NULL DEFAULT 1,
      input_json TEXT,
      next_run_at TEXT NOT NULL,
      last_run_at TEXT,
      last_run_id TEXT,
      last_status TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.exec(`
    INSERT INTO workflow_schedules_new
      (id, workflow_id, name, cron, timezone, enabled, input_json, next_run_at,
       last_run_at, last_run_id, last_status, created_at, updated_at)
    SELECT id, workflow_id, '', cron, 'Asia/Shanghai', enabled, input_json, next_run_at,
           last_run_at, last_run_id, last_status, created_at, updated_at
    FROM workflow_schedules
  `);
  db.exec('DROP TABLE workflow_schedules');
  db.exec('ALTER TABLE workflow_schedules_new RENAME TO workflow_schedules');
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_workflow_schedules_due
      ON workflow_schedules(enabled, next_run_at)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_workflow_schedules_workflow
      ON workflow_schedules(workflow_id)
  `);
}
