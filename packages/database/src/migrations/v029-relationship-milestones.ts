import type { Database } from 'better-sqlite3';

/**
 * v2.0 M2 迁移（版本 29）：共同里程碑达成记录（见 docs/plan/v2.0/05 §2.1，纯加法）。
 *
 * 里程碑定义在代码（RELATIONSHIP_MILESTONES），本表只存「助手 × 里程碑」的达成
 * 事实，防重复触发纪念剧本；payload_json 带轻量上下文（如 sceneId），不存对话原文。
 * 删助手级联删除（与情绪快照/事件流水同生共死，符合「重新认识」语义）。
 *
 * IF NOT EXISTS 守卫，重复执行幂等。
 */
export function migrateV029(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS relationship_milestones (
      id           TEXT PRIMARY KEY,
      assistant_id TEXT NOT NULL REFERENCES assistants(id) ON DELETE CASCADE,
      milestone_key TEXT NOT NULL,
      achieved_at  TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_milestone_unique
      ON relationship_milestones(assistant_id, milestone_key);
    CREATE INDEX IF NOT EXISTS idx_milestone_assistant
      ON relationship_milestones(assistant_id, achieved_at);
  `);
}
