import type { Database } from 'better-sqlite3';

/**
 * v030：VRM 形象导入表（v2.0 M4）
 * 存用户自助导入的 VRM 模型元数据与文件引用；二进制存 data/vrm-avatars/，本表只带引用。
 */
export function migrateV030(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS vrm_avatars (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      file_ref TEXT NOT NULL UNIQUE,
      byte_length INTEGER NOT NULL,
      meta_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}
