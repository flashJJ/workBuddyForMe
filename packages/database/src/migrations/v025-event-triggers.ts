import type { Database } from 'better-sqlite3';

/**
 * v1.7 M5 迁移（版本 25）：自定义短语触发器（M0 §6 冻结形状，纯加法）。
 *
 * 用户为助手绑定「短语 → 内置/自建剧本」的本地触发规则：
 * - phrases_json：短语数组（包含匹配，≤30 条，单条 ≤24 字，应用层校验）；
 * - cooldown_ms / [start_hour,end_hour] / max_per_day / min_intimacy：本地闸门；
 * - 全部判定仅在本机完成，短语不进任何外发请求；
 * - 外键级联：助手删除时规则一并删除；event_id 不设外键（usr.* 行无表，且内置 id 稳定）。
 *
 * IF NOT EXISTS 保证重复执行幂等。
 */
export function migrateV025(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS event_triggers (
      id            TEXT PRIMARY KEY,
      assistant_id  TEXT NOT NULL REFERENCES assistants(id) ON DELETE CASCADE,
      event_id      TEXT NOT NULL,
      phrases_json  TEXT NOT NULL,
      cooldown_ms   INTEGER NOT NULL,
      start_hour    INTEGER NOT NULL,
      end_hour      INTEGER NOT NULL,
      max_per_day   INTEGER NOT NULL,
      min_intimacy  REAL NOT NULL DEFAULT 0,
      enabled       INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_etrig_assistant
      ON event_triggers(assistant_id, enabled);
  `);
}
