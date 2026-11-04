import type { Database } from 'better-sqlite3';

/**
 * v2.21 M1 分支会话迁移（版本 45，纯加法）：
 * conversation_branches 记录父子会话关系、状态、回传 evidence 与预算预留；
 * 不改 conversations 核心表。父/子会话删除时只级联删除关联行，子会话本身保留。
 */
export function migrateV045(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversation_branches (
      id TEXT PRIMARY KEY,
      parent_conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      child_conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      root_conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      goal TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued','running','waiting','succeeded','failed','cancelled','interrupted','budget_exceeded')),
      status_reason TEXT,
      return_evidence_json TEXT,
      reserved_tokens INTEGER NOT NULL DEFAULT 0,
      depth INTEGER NOT NULL,
      archived_at TEXT,
      ended_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_branches_child
      ON conversation_branches(child_conversation_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_conversation_branches_parent_status
      ON conversation_branches(parent_conversation_id, status)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_conversation_branches_root
      ON conversation_branches(root_conversation_id)
  `);
}
