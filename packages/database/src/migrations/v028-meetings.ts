import type { Database } from 'better-sqlite3';

/**
 * v1.9 M3 迁移（版本 28）：多助手会议（见 docs/plan/v1.9/03 §2，纯加法）。
 *
 * meetings：会议主单（议题/成员席次/调度模式/共用模型/状态/auto 轮次计数）。
 * meeting_messages：会内转录，seq 单会议严格递增（单 AbortController 串行写入）；
 * 渲染归属永远以 speaker_id 为准，正文里的身份声称不采信。
 *
 * IF NOT EXISTS 守卫，重复执行幂等。
 */
export function migrateV028(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meetings (
      id          TEXT PRIMARY KEY,
      topic       TEXT NOT NULL,
      member_ids  TEXT NOT NULL,
      mode        TEXT NOT NULL DEFAULT 'manual',
      model_id    TEXT,
      status      TEXT NOT NULL DEFAULT 'active',
      auto_rounds INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL,
      finished_at TEXT
    );

    CREATE TABLE IF NOT EXISTS meeting_messages (
      id           TEXT PRIMARY KEY,
      meeting_id   TEXT NOT NULL,
      seq          INTEGER NOT NULL,
      speaker_kind TEXT NOT NULL,
      speaker_id   TEXT,
      speaker_name TEXT NOT NULL,
      content      TEXT NOT NULL,
      emotion_tag  TEXT,
      truncated    INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_meeting_msg ON meeting_messages(meeting_id, seq);
  `);
}
