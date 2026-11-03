import type { Database } from 'better-sqlite3';

/**
 * v2.19 文档结构迁移（版本 43，纯加法）：
 * - document_chunks 增加章节/块类型/表格坐标列，旧行默认空结构；
 * - document_blocks：解析后的页/章节/段落/表格原子块（可随文档重建）；
 * - knowledge_relations：实体关系边（P2 图检索预留，旧库为空表）。
 *
 * 只做 ADD COLUMN / CREATE TABLE IF NOT EXISTS，不重建表、不改旧列。
 * 旧文档升级后不自动重解析，结构列保持空数组/NULL，检索仍走原文本分片。
 */
export function migrateV043(db: Database): void {
  const tableExists = (name: string) =>
    Boolean(
      db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(name),
    );

  const chunkCols = db.prepare(`PRAGMA table_info(document_chunks)`).all() as Array<{
    name: string;
  }>;
  const hasChunkColumn = (name: string) => chunkCols.some((column) => column.name === name);

  if (tableExists('document_chunks')) {
    if (!hasChunkColumn('section_path')) {
      db.exec(`ALTER TABLE document_chunks ADD COLUMN section_path TEXT NOT NULL DEFAULT '[]'`);
    }
    if (!hasChunkColumn('block_kind')) {
      db.exec(`ALTER TABLE document_chunks ADD COLUMN block_kind TEXT`);
    }
    if (!hasChunkColumn('table_no')) {
      db.exec(`ALTER TABLE document_chunks ADD COLUMN table_no INTEGER`);
    }
    if (!hasChunkColumn('table_row_start')) {
      db.exec(`ALTER TABLE document_chunks ADD COLUMN table_row_start INTEGER`);
    }
    if (!hasChunkColumn('table_row_end')) {
      db.exec(`ALTER TABLE document_chunks ADD COLUMN table_row_end INTEGER`);
    }
  }

  if (tableExists('documents')) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS document_blocks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        ordinal INTEGER NOT NULL,
        kind TEXT NOT NULL,
        page_no INTEGER,
        section_path TEXT NOT NULL DEFAULT '[]',
        content TEXT NOT NULL,
        char_start INTEGER NOT NULL DEFAULT 0,
        char_end INTEGER NOT NULL DEFAULT 0,
        table_json TEXT,
        created_at TEXT NOT NULL
      )
    `);
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_blocks_document ON document_blocks(document_id, ordinal)`,
    );
  }

  if (
    tableExists('knowledge_bases') &&
    tableExists('knowledge_entities') &&
    tableExists('documents') &&
    tableExists('document_chunks')
  ) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_relations (
        id TEXT PRIMARY KEY,
        knowledge_base_id TEXT NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
        from_entity_id TEXT NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
        to_entity_id TEXT NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
        relation TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        source_document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
        source_chunk_id INTEGER REFERENCES document_chunks(id) ON DELETE CASCADE,
        confidence REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_relations_kb ON knowledge_relations(knowledge_base_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_relations_from ON knowledge_relations(from_entity_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_relations_to ON knowledge_relations(to_entity_id)`);
  }
}
