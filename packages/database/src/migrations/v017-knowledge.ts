import type { Database } from 'better-sqlite3';

/**
 * v1.3 知识变厚迁移（版本 17）。纯加法：
 *
 * 1. document_chunks 加页/段坐标（旧行回填 NULL，非 PDF 无页码）。
 * 2. chunks_fts：FTS5 全文虚表（unicode61，写入侧用 fts-tokenize 做中文
 *    uni-gram 归一化）。v017 只建空表，旧分片不回填——由「重建索引/首次
 *    重传/懒填充」补数据，避免大库升级时长时间迁移；空 FTS 不影响向量检索。
 * 3. 知识编译三表（文档摘要/实体/实体提及）：均为可由源文档重建的派生数据，
 *    与向量同级别，不进备份导出。
 * 4. documents 加编译状态列（未编译默认 skipped/0 世代，检索回落 chunk-only）。
 */
export function migrateV017(db: Database): void {
  // ---- 1. chunk 坐标列（SQLite ADD COLUMN 不支持 IF NOT EXISTS，靠 pragma 判重） ----
  const chunkCols = db.prepare(`PRAGMA table_info(document_chunks)`).all() as Array<{
    name: string;
  }>;
  const hasColumn = (name: string) => chunkCols.some((c) => c.name === name);
  if (!hasColumn('page_no')) db.exec(`ALTER TABLE document_chunks ADD COLUMN page_no INTEGER`);
  if (!hasColumn('paragraph_no')) {
    db.exec(`ALTER TABLE document_chunks ADD COLUMN paragraph_no INTEGER`);
  }

  // ---- 2. FTS5 全文虚表（独立虚表，不做 external-content/触发器，显式同步） ----
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
      content,
      chunk_id UNINDEXED,
      kb_id UNINDEXED,
      tokenize = 'unicode61'
    )
  `);

  // ---- 3. 知识编译产物三表 ----
  db.exec(`
    CREATE TABLE IF NOT EXISTS document_summaries (
      document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
      generation INTEGER NOT NULL DEFAULT 1,
      tldr TEXT NOT NULL,
      bullets TEXT NOT NULL DEFAULT '[]',
      key_terms TEXT NOT NULL DEFAULT '[]',
      extractor TEXT NOT NULL,
      model_id TEXT,
      created_at TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_entities (
      id TEXT PRIMARY KEY,
      knowledge_base_id TEXT NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'concept',
      description TEXT NOT NULL DEFAULT '',
      aliases TEXT NOT NULL DEFAULT '[]',
      mention_count INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      UNIQUE(knowledge_base_id, normalized_name)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_entity_mentions (
      id TEXT PRIMARY KEY,
      entity_id TEXT NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      chunk_id INTEGER REFERENCES document_chunks(id) ON DELETE CASCADE,
      page_no INTEGER,
      paragraph_no INTEGER,
      context TEXT NOT NULL,
      generation INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_mentions_entity ON knowledge_entity_mentions(entity_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_mentions_doc ON knowledge_entity_mentions(document_id)`);

  // ---- 4. documents 编译状态列 ----
  const docCols = db.prepare(`PRAGMA table_info(documents)`).all() as Array<{ name: string }>;
  const hasDocColumn = (name: string) => docCols.some((c) => c.name === name);
  if (!hasDocColumn('compile_generation')) {
    db.exec(`ALTER TABLE documents ADD COLUMN compile_generation INTEGER NOT NULL DEFAULT 0`);
  }
  if (!hasDocColumn('compiled_at')) {
    db.exec(`ALTER TABLE documents ADD COLUMN compiled_at TEXT`);
  }
  if (!hasDocColumn('compile_status')) {
    // skipped=尚未纳入编译；摄取成功后由应用改为 queued
    db.exec(`ALTER TABLE documents ADD COLUMN compile_status TEXT NOT NULL DEFAULT 'skipped'`);
  }
  if (!hasDocColumn('compile_error')) {
    db.exec(`ALTER TABLE documents ADD COLUMN compile_error TEXT`);
  }
}
