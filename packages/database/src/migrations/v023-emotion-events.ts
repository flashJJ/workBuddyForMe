import type { Database } from 'better-sqlite3';

/**
 * v1.6 迁移（版本 23）：情绪事件流水表（纯加法）。
 *
 * 与 assistant_emotion_states（当前状态快照）分工：
 * - states 每助手一行，存最新 mood/relation/counters 与最近 10 条事件（v022）；
 * - events 是不可变追加流水，供设置面板查看近期互动来源/时间分布与后续 v2.0 关系曲线。
 *
 * 隐私边界（M0 契约 §7）：只存类型/来源/情绪标签/强度/时间戳与 message_id 外键，
 * 不存任何对话原文；消息删除时外键置空，助手删除时级联。
 */
export function migrateV023(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS emotion_events (
      id TEXT PRIMARY KEY,
      assistant_id TEXT NOT NULL REFERENCES assistants(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      source TEXT NOT NULL,
      emotion TEXT,
      intensity REAL,
      message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_emotion_events_assistant
      ON emotion_events(assistant_id, created_at DESC)
  `);
}
