import type { Database } from 'better-sqlite3';

/**
 * v0.5 长期记忆迁移（版本 6）。只做加法：
 * - assistants.memory_enabled：每助手记忆开关，默认 1（开）；
 * - memories：提取去重后的长期记忆。id 用 INTEGER PRIMARY KEY，
 *   直接作为 memories_vec 虚表的 rowid（与 document_chunks/chunks_vec 同构）；
 * - memories_vec 不在迁移内创建，而在首次写入时按 embedding 维度动态创建
 *   （见 memory-vector.ts，与 chunks_vec 同一策略，维度记录在 meta 表）。
 * 旧助手 memory_enabled=1，行为与既有对话一致（默认开启记忆）。
 */
export function migrateV006(db: Database): void {
  db.exec(`ALTER TABLE assistants ADD COLUMN memory_enabled INTEGER NOT NULL DEFAULT 1`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      content TEXT NOT NULL,
      importance REAL NOT NULL DEFAULT 0.5,
      source_conversation_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_accessed_at TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_status ON memories(status, created_at DESC)`);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_memories_source ON memories(source_conversation_id)`,
  );
}
