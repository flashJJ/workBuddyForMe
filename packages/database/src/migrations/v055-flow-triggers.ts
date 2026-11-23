import type { Database } from 'better-sqlite3';

/**
 * v4.25 P1：流程事件触发（版本 55，纯加法）。
 *
 * workflow_triggers：一个流程可配多条触发器；
 * webhook 仅存 SHA-256 哈希，file 配置存 config_json。
 */
export function migrateV055(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_triggers (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      config_json TEXT NOT NULL,
      secret_hash TEXT,
      last_fired_at TEXT,
      last_run_id TEXT,
      last_status TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_workflow_triggers_workflow
      ON workflow_triggers(workflow_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_workflow_triggers_kind
      ON workflow_triggers(kind, enabled)
  `);
}
