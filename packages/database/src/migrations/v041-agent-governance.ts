import type { Database } from 'better-sqlite3';

/**
 * v2.13 M1/M3 治理底座（版本 41，纯加法）：
 * - task_runs 四列：执行模式 / 工作目录 / 策略快照 / 来源定时任务；
 * - audit_events：追加式哈希链审计账本（M3 起写入）。
 */
export function migrateV041(db: Database): void {
  const columns = db.prepare('PRAGMA table_info(task_runs)').all() as Array<{ name: string }>;
  if (columns.length > 0) {
    const add = (name: string, ddl: string) => {
      if (!columns.some((column) => column.name === name)) {
        db.exec(`ALTER TABLE task_runs ADD COLUMN ${name} ${ddl}`);
      }
    };
    add('permission_mode', "TEXT NOT NULL DEFAULT 'confirm_each'");
    add('workspace_path', 'TEXT');
    add('policy_snapshot_json', 'TEXT');
    add('origin_scheduled_task_id', 'TEXT');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      seq INTEGER NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      kind TEXT NOT NULL,
      actor TEXT NOT NULL,
      run_id TEXT,
      conversation_id TEXT,
      tool TEXT,
      decision TEXT,
      reason_code TEXT,
      policy_hash TEXT,
      binding_json TEXT,
      outcome TEXT,
      prev_hash TEXT NOT NULL,
      hash TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_run ON audit_events(run_id);
    CREATE INDEX IF NOT EXISTS idx_audit_kind ON audit_events(kind);
  `);
}
