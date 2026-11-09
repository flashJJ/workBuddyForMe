import type { Database } from 'better-sqlite3';

/**
 * v2.31 P0 记忆关系边迁移（版本 50，纯加法）：
 * - memory_edges：记录同一消息 / 同一回合内写入的记忆之间的来源关系；
 * - 边是派生数据，可重建、可删除，不进入备份强一致范围；
 * - 不建外键：记忆归档后边保留，由查询侧 JOIN memories 过滤，整理任务负责清理悬空边。
 * 旧库升级只新增空表与索引，不回填、不改动任何既有记忆。
 */
export function migrateV050(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_edges (
      id TEXT PRIMARY KEY,
      from_id TEXT NOT NULL,
      to_id TEXT NOT NULL,
      relation TEXT NOT NULL,
      weight REAL NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (from_id, to_id, relation)
    )
  `);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_memory_edges_from ON memory_edges(from_id)`,
  );
  db.exec(`CREATE INDEX IF NOT EXISTS idx_memory_edges_to ON memory_edges(to_id)`);
}
