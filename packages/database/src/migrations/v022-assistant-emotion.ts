import type { Database } from 'better-sqlite3';

/**
 * v1.6 迁移（版本 22）：助手情绪/关系状态表（纯加法）。
 *
 * assistant_emotion_states 每助手至多一行：
 * - assistant_id 主键且外键级联删除（删助手即销毁关系数据）；
 * - state_json 为 EmotionState 完整 JSON（mood/relation/need/counters/recentEvents/
 *   schemaVersion/updatedAt 毫秒时间戳），应用侧读时惰性衰减，表内只存最后事件时刻；
 * - updated_at 为 ISO 文本列，与全库时间列约定一致（仅作排序/运维观察，状态真值在 JSON 内）。
 *
 * 存量库不回填：无行 = 默认状态（读侧回落 createDefaultEmotionState），
 * 避免为全部助手凭空写入关系行。
 */
export function migrateV022(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS assistant_emotion_states (
      assistant_id TEXT PRIMARY KEY REFERENCES assistants(id) ON DELETE CASCADE,
      state_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
}
