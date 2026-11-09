import type { Database } from 'better-sqlite3';

/**
 * v2.33 P1 附件引用计数（版本 51，纯加法）：
 * - attachment_refs 记录附件被消息/产物引用的情况，主键天然幂等；
 * - attachment_id 外键级联，附件行删除时引用自动清理；
 * - messages 删除触发器兜底清理消息引用（会话级联删除同样生效）。
 * 不改动 attachments 表结构，也不物理删除任何文件。
 */
export function migrateV051(db: Database): void {
  const hasAttachments = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'attachments'`)
    .get();
  if (!hasAttachments) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS attachment_refs (
      attachment_id TEXT NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
      owner_type TEXT NOT NULL CHECK (owner_type IN ('message', 'artifact')),
      owner_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (attachment_id, owner_type, owner_id)
    );
    CREATE INDEX IF NOT EXISTS idx_attachment_refs_owner
      ON attachment_refs(owner_type, owner_id);
  `);

  const hasMessages = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'messages'`)
    .get();
  if (!hasMessages) return;

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_messages_attachment_refs_delete
    AFTER DELETE ON messages
    BEGIN
      DELETE FROM attachment_refs
      WHERE owner_type = 'message' AND owner_id = OLD.id;
    END;
  `);
}
