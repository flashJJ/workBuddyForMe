import type { Database } from 'better-sqlite3';

/**
 * v5.0 运行兜底（版本 57，纯加法）：
 * - workflow_runs：运行图快照/哈希/批量重放批次；
 * - flow_run_compensations：失败补偿链；
 * - workflow_schedules：错过次数；
 * - workflow_triggers：Webhook Secret 密文（HMAC 验签用）。
 *
 * 所有 ALTER 先检查列是否存在，兼容重复执行与测试。
 */
export function migrateV057(db: Database): void {
  addColumn(db, 'workflow_runs', 'graph_snapshot_json', 'graph_snapshot_json TEXT');
  addColumn(db, 'workflow_runs', 'graph_hash', 'graph_hash TEXT');
  addColumn(db, 'workflow_runs', 'replay_batch_id', 'replay_batch_id TEXT');
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_workflow_runs_replay_batch
       ON workflow_runs(replay_batch_id)`,
  );

  db.exec(`
    CREATE TABLE IF NOT EXISTS flow_run_compensations (
      id TEXT PRIMARY KEY,
      root_run_id TEXT NOT NULL UNIQUE REFERENCES workflow_runs(id) ON DELETE CASCADE,
      workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
      attempt INTEGER NOT NULL DEFAULT 1,
      state TEXT NOT NULL DEFAULT 'pending',
      next_retry_at TEXT,
      last_run_id TEXT REFERENCES workflow_runs(id) ON DELETE SET NULL,
      last_error_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_flow_run_compensations_due
      ON flow_run_compensations(state, next_retry_at)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_flow_run_compensations_workflow
      ON flow_run_compensations(workflow_id, created_at DESC)
  `);

  addColumn(
    db,
    'workflow_schedules',
    'missed_count',
    'missed_count INTEGER NOT NULL DEFAULT 0',
  );
  addColumn(db, 'workflow_schedules', 'last_missed_at', 'last_missed_at TEXT');
  addColumn(db, 'workflow_triggers', 'secret_cipher', 'secret_cipher TEXT');
}

function addColumn(db: Database, table: string, column: string, ddl: string): void {
  const columns = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
  if (columns.some((item) => item.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}
