import type { Database } from 'better-sqlite3';

/**
 * v0.8 M0 Flow Studio 迁移（版本 12）。只做加法：
 * - workflows：工作流元信息与发布状态机（draft/published/disabled）；
 * - workflow_versions：图快照（graph_json），每次保存自增版本，发布固定版本；
 * - workflow_runs：一次运行（触发方式、状态机、输入/输出/错误、人工挂起点）；
 * - node_executions：逐节点执行记录（解析后入参/输出/耗时），供试运行时间线与回放。
 */
export function migrateV012(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT 'workflow',
      color TEXT NOT NULL DEFAULT 'default',
      status TEXT NOT NULL DEFAULT 'draft',
      current_version INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_versions (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      graph_json TEXT NOT NULL,
      published_at TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(workflow_id, version)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_runs (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      trigger TEXT NOT NULL DEFAULT 'manual',
      status TEXT NOT NULL DEFAULT 'queued',
      input_json TEXT,
      output_json TEXT,
      error_json TEXT,
      conversation_id TEXT,
      wait_node_id TEXT,
      started_at TEXT,
      finished_at TEXT,
      created_at TEXT NOT NULL
    )
  `);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_workflow_runs_flow ON workflow_runs(workflow_id, created_at DESC)`,
  );

  db.exec(`
    CREATE TABLE IF NOT EXISTS node_executions (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
      node_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      inputs_json TEXT,
      outputs_json TEXT,
      error_json TEXT,
      started_at TEXT,
      finished_at TEXT,
      duration_ms INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_node_executions_run ON node_executions(run_id)`);
}
