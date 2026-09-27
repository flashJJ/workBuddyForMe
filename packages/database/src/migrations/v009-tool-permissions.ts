import type { Database } from 'better-sqlite3';

/**
 * v0.6 M2 工具权限分级迁移（版本 9）。只做加法：
 * - tool_permissions：按工具×维度的授权记忆（HITL 确认后落库）。
 *   tool_name 为限定名（内置工具名或 mcp:<server>:<tool>）；
 *   scope 区分全局（'all'）与按助手（'assistant:<id>'）；
 *   action 为 allow/deny，deny 记录可覆盖 allow。
 */
export function migrateV009(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tool_permissions (
      id TEXT PRIMARY KEY,
      tool_name TEXT NOT NULL,
      scope TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('allow', 'deny')),
      granted_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tool_permissions_tool ON tool_permissions(tool_name)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tool_permissions_scope ON tool_permissions(scope)`);
}
