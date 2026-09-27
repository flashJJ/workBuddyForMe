import type { Database } from 'better-sqlite3';

/**
 * v0.6 MCP 服务器迁移（版本 8）。只做加法：
 * - mcp_servers：用户接入的 MCP 服务器配置。
 *   stdio 与 http（M2）字段同居一行，按 transport 取用，避免后续破坏性迁移；
 * - name 即命名空间（mcp:<name>:<tool>），唯一索引保证限定名不冲突；
 * - args/env/headers 以 JSON 文本存储，读取端容错解析。
 */
export function migrateV008(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mcp_servers (
      id TEXT PRIMARY KEY,
      transport TEXT NOT NULL CHECK (transport IN ('stdio', 'http')),
      name TEXT NOT NULL,
      command TEXT NOT NULL DEFAULT '',
      args TEXT NOT NULL DEFAULT '[]',
      env TEXT NOT NULL DEFAULT '{}',
      url TEXT NOT NULL DEFAULT '',
      headers TEXT NOT NULL DEFAULT '{}',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_mcp_servers_name ON mcp_servers(name)`);
}
