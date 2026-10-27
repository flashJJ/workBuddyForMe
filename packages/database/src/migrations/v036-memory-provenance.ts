import type { Database } from 'better-sqlite3';

/**
 * v2.6 M4 记忆溯源迁移（版本 36）。只做加法：
 * - memories.source_message_id：提取该记忆时的助手消息 id；旧记忆/摘要/手工为 NULL；
 * - memories.recall_count：语义召回次数，默认 0，命中时 +1；
 * - 来源消息索引便于「从记忆回到消息」。
 * 旧数据无需回填；NULL 在 UI 显示「来源未知」，不伪造来源。
 */
export function migrateV036(db: Database): void {
  // 兼容旧测试/局部库：没有 memories（正常全量迁移不会出现）时跳过而非报错
  const table = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='memories'`)
    .get() as { name: string } | undefined;
  if (!table) return;
  const columns = db.prepare(`PRAGMA table_info(memories)`).all() as Array<{ name: string }>;
  const has = (name: string) => columns.some((column) => column.name === name);
  if (!has('source_message_id')) {
    db.exec(`ALTER TABLE memories ADD COLUMN source_message_id TEXT`);
  }
  if (!has('recall_count')) {
    db.exec(`ALTER TABLE memories ADD COLUMN recall_count INTEGER NOT NULL DEFAULT 0`);
  }
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_memories_source_message ON memories(source_message_id)`,
  );
}
