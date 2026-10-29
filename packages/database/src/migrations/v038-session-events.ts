import type { Database } from 'better-sqlite3';

/**
 * v2.9 追加式事件日志（版本 38）。只做加法：
 * - session_events：scope(chat/task/flow/agent) + scope_id + 单调 seq + payload；
 * - session_events_fts：CJK uni-gram 全文索引（写入侧 normalizeForFtsIndex）；
 * - 事件是时间线真源，业务表仍是查询投影；只追加，不更新。
 */
export function migrateV038(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_events (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      schema_version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    )
  `);
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_session_events_seq
     ON session_events(scope, scope_id, seq)`,
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_session_events_created ON session_events(created_at)`,
  );
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS session_events_fts USING fts5(
      content,
      event_id UNINDEXED,
      scope UNINDEXED,
      scope_id UNINDEXED,
      tokenize = 'unicode61'
    )
  `);
}
