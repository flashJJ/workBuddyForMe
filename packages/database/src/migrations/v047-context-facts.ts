import type { Database } from 'better-sqlite3';

/**
 * v2.26 P1 上下文分层压缩迁移（版本 47，纯加法）：
 * - conversation_facts：从折叠原文抽取的结构化事实/决策/未决问题，
 *   以 (conversation_id, kind, key) 唯一，checksum 相同视为未变化；
 * - task_checkpoints：工作记忆快照（目标/计划/待办/最近工具摘要/下一步），
 *   带 expires_at，任务完成或超时归档，不参与长期记忆。
 * 旧库升级不触碰任何存量表，仅新增空表与索引。
 */
export function migrateV047(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversation_facts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'fact',
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      unit TEXT,
      valid_from TEXT,
      source_message_ids TEXT,
      checksum TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(conversation_id, kind, key)
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_conversation_facts_conversation
      ON conversation_facts(conversation_id, kind)
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS task_checkpoints (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      task_run_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      goal TEXT,
      plan TEXT,
      todos_json TEXT,
      last_tool_summary TEXT,
      next_step TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_task_checkpoints_active
      ON task_checkpoints(conversation_id, status, expires_at)
  `);
}
