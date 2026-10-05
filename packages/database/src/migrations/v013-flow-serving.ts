import type { Database } from 'better-sqlite3';

/**
 * v0.9 Flow Serving 迁移（版本 13）。纯加法：
 * - workflow_endpoints：一流程一端点，对外暴露（HTTP/MCP）开关、密钥哈希、
 *   同步超时、限速、无人值守危险操作策略；
 * - workflow_runs 增列：端点来源、重放关联、中断原因（均可 NULL，旧行为不变）。
 */
export function migrateV013(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_endpoints (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL UNIQUE REFERENCES workflows(id) ON DELETE CASCADE,
      key_hash TEXT NOT NULL UNIQUE,
      key_prefix TEXT NOT NULL,
      http_enabled INTEGER NOT NULL DEFAULT 0,
      mcp_enabled INTEGER NOT NULL DEFAULT 0,
      sync_timeout_ms INTEGER NOT NULL DEFAULT 60000,
      rate_limit_per_min INTEGER NOT NULL DEFAULT 30,
      policy_mode TEXT NOT NULL DEFAULT 'deny_all',
      policy_allowed_tools_json TEXT NOT NULL DEFAULT '[]',
      policy_revalidation_required INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'enabled',
      last_used_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // workflow_runs 增列（better-sqlite3 无 IF NOT EXISTS for ADD COLUMN，重复迁移由 user_version 门控兜底）
  const runCols = new Set(
    (db.pragma('table_info(workflow_runs)') as { name: string }[]).map((c) => c.name),
  );
  const addRunColumn = (name: string, ddl: string) => {
    if (!runCols.has(name)) db.exec(`ALTER TABLE workflow_runs ADD COLUMN ${ddl}`);
  };
  addRunColumn('endpoint_id', 'endpoint_id TEXT');
  addRunColumn('parent_run_id', 'parent_run_id TEXT');
  addRunColumn('resumed_from_node', 'resumed_from_node TEXT');
  addRunColumn('interrupt_reason', 'interrupt_reason TEXT');

  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_workflow_runs_endpoint ON workflow_runs(endpoint_id, created_at DESC)`,
  );
  db.exec(`CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(status)`);
}
