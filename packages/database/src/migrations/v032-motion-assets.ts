import type { Database } from 'better-sqlite3';

/**
 * v032：待机动作（VRMA）导入表（v2.0）
 * 存用户自助导入的 VRMA 待机动画元数据与文件引用；二进制存 data/motions/，本表只带引用。
 */
export function migrateV032(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS motion_assets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      file_ref TEXT NOT NULL UNIQUE,
      byte_length INTEGER NOT NULL,
      source TEXT,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}
