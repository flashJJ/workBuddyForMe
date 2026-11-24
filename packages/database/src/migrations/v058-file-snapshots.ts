import type { Database } from 'better-sqlite3';

/**
 * v5.1 文件安全（版本 58，纯加法）：
 * - file_snapshots：危险动作执行前的内容/元数据快照；
 * - 内容按 sha256 内容寻址存放，表内只记 blob 相对路径；
 * - 回滚按 run_id 读取，运行删除时级联清理元数据。
 */
export function migrateV058(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS file_snapshots (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
      workflow_id TEXT NOT NULL,
      node_id TEXT,
      tool_name TEXT NOT NULL,
      action TEXT NOT NULL,
      path TEXT NOT NULL,
      target_path TEXT,
      existed_before INTEGER NOT NULL,
      byte_size INTEGER NOT NULL DEFAULT 0,
      sha256 TEXT,
      written_sha256 TEXT,
      blob_path TEXT,
      truncated INTEGER NOT NULL DEFAULT 0,
      truncation_reason TEXT,
      created_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_file_snapshots_run
      ON file_snapshots(run_id, created_at DESC)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_file_snapshots_created
      ON file_snapshots(created_at)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_file_snapshots_path
      ON file_snapshots(path)
  `);
}
