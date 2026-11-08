import type { Database } from 'better-sqlite3';
import { normalizeForFtsIndex } from '../fts-tokenize';

/**
 * v2.26 M1 记忆生命周期迁移（版本 46，纯加法）：
 * - memories 增加作用域/来源/置顶/置信度/主体键/版本链/有效期/TTL/确认时间；
 * - memory_events 记录 create/merge/update/supersede/archive/restore/delete 审计流水；
 * - memories_fts 中文关键词召回索引（复用 uni-gram 分词），迁移内回填存量记忆。
 * 旧数据统一 scope='global'、source='legacy'、version=1，保持全局可见与既有行为。
 */
export function migrateV046(db: Database): void {
  db.exec(`ALTER TABLE memories ADD COLUMN scope TEXT NOT NULL DEFAULT 'global'`);
  db.exec(`ALTER TABLE memories ADD COLUMN assistant_id TEXT`);
  db.exec(`ALTER TABLE memories ADD COLUMN source TEXT NOT NULL DEFAULT 'legacy'`);
  db.exec(`ALTER TABLE memories ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0`);
  db.exec(`ALTER TABLE memories ADD COLUMN confidence REAL NOT NULL DEFAULT 1`);
  db.exec(`ALTER TABLE memories ADD COLUMN subject_key TEXT`);
  db.exec(`ALTER TABLE memories ADD COLUMN version INTEGER NOT NULL DEFAULT 1`);
  db.exec(`ALTER TABLE memories ADD COLUMN superseded_by INTEGER`);
  db.exec(`ALTER TABLE memories ADD COLUMN valid_from TEXT`);
  db.exec(`ALTER TABLE memories ADD COLUMN valid_to TEXT`);
  db.exec(`ALTER TABLE memories ADD COLUMN ttl_at TEXT`);
  db.exec(`ALTER TABLE memories ADD COLUMN last_confirmed_at TEXT`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      memory_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      before_json TEXT,
      after_json TEXT,
      actor TEXT NOT NULL DEFAULT 'system',
      created_at TEXT NOT NULL
    )
  `);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_memory_events_memory
       ON memory_events(memory_id, created_at DESC)`,
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_memories_scope
       ON memories(scope, assistant_id, status)`,
  );
  db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_subject ON memories(subject_key)`);

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      content,
      memory_id UNINDEXED,
      tokenize = 'unicode61'
    )
  `);
  backfillMemoryFts(db);
}

/** 只在 FTS 为空时回填，避免重复迁移/重启造成重复索引 */
function backfillMemoryFts(db: Database): void {
  const existing = (db.prepare(`SELECT COUNT(*) AS n FROM memories_fts`).get() as { n: number }).n;
  if (existing > 0) return;
  const rows = db.prepare(`SELECT id, content FROM memories`).all() as Array<{
    id: number;
    content: string;
  }>;
  if (rows.length === 0) return;
  const insert = db.prepare(`INSERT INTO memories_fts(content, memory_id) VALUES (?, ?)`);
  for (const row of rows) insert.run(normalizeForFtsIndex(row.content), row.id);
}
