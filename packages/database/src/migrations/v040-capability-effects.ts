import type { Database } from 'better-sqlite3';

/**
 * v2.11 M1/M2/M3 能力包 effect 支撑（版本 40）。只做加法：
 * - workflows.origin_capability_id：能力包来源标记（卸载后保留禁用行时可读）；
 * - installed_event_scripts：能力包安装的声明式事件剧本；
 * - report_widgets：声明式报告卡片；
 * - subagent_runs：外部代理运行证据。
 */
export function migrateV040(db: Database): void {
  const columns = db.prepare('PRAGMA table_info(workflows)').all() as Array<{ name: string }>;
  // 测试里存在「仅设置 user_version 的稀疏旧库」：表不存在时跳过加列（真实旧库必有 workflows）
  if (columns.length > 0 && !columns.some((column) => column.name === 'origin_capability_id')) {
    db.exec('ALTER TABLE workflows ADD COLUMN origin_capability_id TEXT');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS installed_event_scripts (
      id TEXT PRIMARY KEY,
      pack_id TEXT NOT NULL,
      name TEXT NOT NULL,
      definition_json TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS report_widgets (
      id TEXT PRIMARY KEY,
      pack_id TEXT NOT NULL,
      title TEXT NOT NULL,
      config_json TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS subagent_runs (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      goal TEXT NOT NULL,
      cwd TEXT NOT NULL,
      conversation_id TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      summary TEXT,
      error_code TEXT,
      error_message TEXT,
      output_bytes INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      started_at TEXT,
      ended_at TEXT
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_installed_event_scripts_enabled
      ON installed_event_scripts(enabled);
    CREATE INDEX IF NOT EXISTS idx_report_widgets_enabled
      ON report_widgets(enabled);
    CREATE INDEX IF NOT EXISTS idx_subagent_runs_created
      ON subagent_runs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_subagent_runs_status
      ON subagent_runs(status, created_at DESC);
  `);
}
