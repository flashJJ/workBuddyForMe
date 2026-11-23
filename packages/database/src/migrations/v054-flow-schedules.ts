import type { Database } from 'better-sqlite3';

/**
 * v4.24 P1：流程定时触发（版本 54，纯加法）。
 *
 * workflow_schedules：一个流程至多一行定时配置；
 * next_run_at 用 ISO 文本存储，配合 enabled 建索引供调度器扫描到期项。
 */
export function migrateV054(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_schedules (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL UNIQUE REFERENCES workflows(id) ON DELETE CASCADE,
      cron TEXT NOT NULL,
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
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_workflow_schedules_due
       ON workflow_schedules(enabled, next_run_at)`,
  );
}
