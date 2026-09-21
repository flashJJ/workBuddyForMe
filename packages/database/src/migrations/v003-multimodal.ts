import type { Database } from 'better-sqlite3';

/**
 * v0.3 多模态版本迁移（版本 3）。只做加法：
 * - attachments：聊天图片附件元数据（文件本体在数据根 attachments/，不入库）；
 * - messages.content_parts：多模态片段 JSON，老消息默认 [] 回落 content；
 * - documents.source/source_url：网页剪藏来源，老文档默认 upload。
 */
export function migrateV003(db: Database): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS attachments (
       id TEXT PRIMARY KEY,
       filename TEXT NOT NULL,
       mime_type TEXT NOT NULL,
       byte_size INTEGER NOT NULL,
       storage_path TEXT NOT NULL,
       content_hash TEXT NOT NULL,
       created_at TEXT NOT NULL
     )`,
  );
  db.exec(`ALTER TABLE messages ADD COLUMN content_parts TEXT NOT NULL DEFAULT '[]'`);
  db.exec(`ALTER TABLE documents ADD COLUMN source TEXT NOT NULL DEFAULT 'upload'`);
  db.exec(`ALTER TABLE documents ADD COLUMN source_url TEXT`);
}
