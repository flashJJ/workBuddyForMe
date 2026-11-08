import type { Database } from 'better-sqlite3';

/**
 * v2.29 P0 文档解析版本迁移（版本 49，纯加法 + 一次性元数据回填）：
 * - documents.parse_version：成功落库时的解析器版本，0 表示尚未按当前解析器完成；
 * - 已有 document_blocks 的文档回填为 1，避免 v2.19 已解析文档被误判为待重建；
 * - 只改版本号，不重写任何解析内容；重复执行安全。
 */
export function migrateV049(db: Database): void {
  const columns = db.prepare(`PRAGMA table_info(documents)`).all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === 'parse_version')) {
    db.exec(`ALTER TABLE documents ADD COLUMN parse_version INTEGER NOT NULL DEFAULT 0`);
  }

  const hasBlocks = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'document_blocks'`)
    .get();
  if (!hasBlocks) return;

  db.exec(`
    UPDATE documents SET parse_version = 1
    WHERE parse_version = 0
      AND EXISTS (SELECT 1 FROM document_blocks WHERE document_id = documents.id)
  `);
}
