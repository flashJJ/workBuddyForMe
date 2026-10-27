import type { Database } from 'better-sqlite3';

/**
 * v2.6 迁移（版本 35）：会议结论与行动项（纯加法）。
 *
 * meeting_conclusions：一场会议至多一条当前结论；重新生成覆盖正文。
 * meeting_action_items：source=generated 随结论重生成替换，source=manual 保留；
 * status 只允许 open/done/cancelled，不物理删除以保留会议审计。
 *
 * IF NOT EXISTS 守卫，重复执行幂等。
 */
export function migrateV035(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meeting_conclusions (
      meeting_id           TEXT PRIMARY KEY,
      summary              TEXT NOT NULL,
      decisions_json       TEXT NOT NULL DEFAULT '[]',
      open_questions_json  TEXT NOT NULL DEFAULT '[]',
      model_id             TEXT,
      generated_at         TEXT NOT NULL,
      edited_at            TEXT
    );

    CREATE TABLE IF NOT EXISTS meeting_action_items (
      id                TEXT PRIMARY KEY,
      meeting_id        TEXT NOT NULL,
      content           TEXT NOT NULL,
      owner_label       TEXT NOT NULL DEFAULT '',
      owner_member_id   TEXT,
      due_at            TEXT,
      status            TEXT NOT NULL DEFAULT 'open'
                        CHECK(status IN ('open','done','cancelled')),
      source            TEXT NOT NULL DEFAULT 'generated'
                        CHECK(source IN ('generated','manual')),
      source_turn_id    TEXT,
      linked_reminder_id TEXT,
      linked_flow_run_id TEXT,
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_meeting_action_items
      ON meeting_action_items(meeting_id, source, created_at);
  `);
}
