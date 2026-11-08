import type { Database } from 'better-sqlite3';

/**
 * v2.28 P1 审计轮转迁移（版本 48，纯加法）：
 * - memory_event_rollups：过期审计事件按 (action, actor) 聚合后的计数，轮转后仍可核对；
 * - memory_events(created_at) 索引：轮转按时间扫描，不影响既有按 memory_id 查询。
 * 旧库升级只新增空表与索引，迁移内不执行任何轮转、不回填存量事件。
 */
export function migrateV048(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_event_rollups (
      action TEXT NOT NULL,
      actor TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (action, actor)
    )
  `);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_memory_events_created
       ON memory_events(created_at)`,
  );
}
