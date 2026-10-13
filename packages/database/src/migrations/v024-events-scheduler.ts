import type { Database } from 'better-sqlite3';

/**
 * v1.7 迁移（版本 24）：剧情事件与角色化提醒（纯加法，见 docs/plan/v1.7/03）。
 *
 * 1. assistants +4 人格权重列（REAL NOT NULL DEFAULT 0.5，老行自动取默认）；
 * 2. scheduled_tasks：once/daily/weekly 提醒，墙钟+时区双存储，tick 只比 UTC；
 * 3. event_usage：剧本冷却/每日上限闸门与打扰率本地统计（追加型流水）。
 *
 * 全部 IF NOT EXISTS / 列存在性守卫，重复执行幂等。
 */
export function migrateV024(db: Database): void {
  const cols = db.prepare(`PRAGMA table_info(assistants)`).all() as Array<{ name: string }>;
  const addColumn = (name: string) => {
    if (!cols.some((c) => c.name === name)) {
      db.exec(`ALTER TABLE assistants ADD COLUMN ${name} REAL NOT NULL DEFAULT 0.5`);
    }
  };
  addColumn('personality_frankness');
  addColumn('personality_tsundere');
  addColumn('personality_shy');
  addColumn('personality_tolerance');

  db.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id            TEXT PRIMARY KEY,
      assistant_id  TEXT NOT NULL REFERENCES assistants(id) ON DELETE CASCADE,
      kind          TEXT NOT NULL CHECK (kind IN ('once','daily','weekly')),
      hour          INTEGER NOT NULL CHECK (hour BETWEEN 0 AND 23),
      minute        INTEGER NOT NULL CHECK (minute BETWEEN 0 AND 59),
      weekday       INTEGER,
      at_date       TEXT,
      timezone      TEXT NOT NULL DEFAULT 'Asia/Shanghai',
      text          TEXT NOT NULL,
      enabled       INTEGER NOT NULL DEFAULT 1,
      next_run_at   TEXT NOT NULL,
      last_fired_at TEXT,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sched_next_run
      ON scheduled_tasks(enabled, next_run_at);
    CREATE INDEX IF NOT EXISTS idx_sched_assistant
      ON scheduled_tasks(assistant_id);

    CREATE TABLE IF NOT EXISTS event_usage (
      id           TEXT PRIMARY KEY,
      assistant_id TEXT NOT NULL REFERENCES assistants(id) ON DELETE CASCADE,
      event_id     TEXT NOT NULL,
      date_key     TEXT NOT NULL,
      played_at    TEXT NOT NULL,
      outcome      TEXT NOT NULL CHECK (outcome IN ('played','skipped','interrupted','suppressed')),
      reason       TEXT,
      priority     INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_usage_daily
      ON event_usage(assistant_id, event_id, date_key);
    CREATE INDEX IF NOT EXISTS idx_usage_recent
      ON event_usage(assistant_id, played_at);
  `);
}
