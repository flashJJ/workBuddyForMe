import type { Database } from 'better-sqlite3';

/**
 * 初始 schema（版本 1）。
 * 注意建表顺序：knowledge_bases 先于 assistants（外键引用）。
 */
const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS meta (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS providers (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     protocol TEXT NOT NULL DEFAULT 'openai-compatible',
     base_url TEXT NOT NULL,
     api_key_cipher TEXT,
     enabled INTEGER NOT NULL DEFAULT 1,
     sort_order INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS models (
     id TEXT PRIMARY KEY,
     provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
     model_id TEXT NOT NULL,
     display_name TEXT NOT NULL,
     capabilities TEXT NOT NULL DEFAULT '["chat"]',
     context_window INTEGER,
     created_at TEXT NOT NULL,
     UNIQUE(provider_id, model_id)
   )`,
  `CREATE TABLE IF NOT EXISTS knowledge_bases (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     description TEXT NOT NULL DEFAULT '',
     chunk_size INTEGER NOT NULL DEFAULT 500,
     chunk_overlap INTEGER NOT NULL DEFAULT 80,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS assistants (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     emoji TEXT,
     color TEXT,
     system_prompt TEXT NOT NULL DEFAULT '',
     temperature REAL NOT NULL DEFAULT 1,
     top_p REAL NOT NULL DEFAULT 1,
     max_tokens INTEGER,
     model_id TEXT REFERENCES models(id) ON DELETE SET NULL,
     knowledge_base_id TEXT REFERENCES knowledge_bases(id) ON DELETE SET NULL,
     is_builtin INTEGER NOT NULL DEFAULT 0,
     sort_order INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS conversations (
     id TEXT PRIMARY KEY,
     assistant_id TEXT NOT NULL REFERENCES assistants(id) ON DELETE CASCADE,
     title TEXT NOT NULL DEFAULT '新会话',
     last_message_at TEXT,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS messages (
     id TEXT PRIMARY KEY,
     conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
     role TEXT NOT NULL,
     content TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL DEFAULT 'completed',
     prompt_tokens INTEGER,
     completion_tokens INTEGER,
     total_tokens INTEGER,
     citations TEXT NOT NULL DEFAULT '[]',
     error_code TEXT,
     error_message TEXT,
     created_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS documents (
     id TEXT PRIMARY KEY,
     knowledge_base_id TEXT NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
     filename TEXT NOT NULL,
     file_type TEXT NOT NULL,
     byte_size INTEGER NOT NULL,
     content_hash TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'pending',
     error_message TEXT,
     chunk_count INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL,
     indexed_at TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS document_chunks (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
     ordinal INTEGER NOT NULL,
     content TEXT NOT NULL,
     char_start INTEGER NOT NULL DEFAULT 0,
     char_end INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_chunks_document ON document_chunks(document_id)`,
  `CREATE TABLE IF NOT EXISTS settings_kv (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL,
     updated_at TEXT NOT NULL
   )`,
];

export function migrateV001(db: Database): void {
  for (const sql of STATEMENTS) db.exec(sql);
}
