import type { DatabaseInstance } from '../client';
import { emotionStateSchema, type EmotionState } from '@wbfm/shared/schemas';

/** 情绪状态表行（state_json 为完整 EmotionState JSON） */
export interface EmotionStateRow {
  assistant_id: string;
  state_json: string;
  updated_at: string;
}

/** repo 领域对象：助手 id + 结构化状态 + ISO 更新时间列 */
export interface EmotionStateRecord {
  assistantId: string;
  state: EmotionState;
  updatedAt: string;
}

/** 备份轨条目形态（assistantId + state；updatedAt 随 JSON 与列双写） */
export type EmotionStateEntry = EmotionStateRecord;

function mapRow(row: EmotionStateRow): EmotionStateRecord | null {
  try {
    const parsed: unknown = JSON.parse(row.state_json);
    // 只接受契约合法的状态；损坏行不向上抛出，按「无状态」回落（服务层给默认值）
    const result = emotionStateSchema.safeParse(parsed);
    if (!result.success) return null;
    return { assistantId: row.assistant_id, state: result.data, updatedAt: row.updated_at };
  } catch {
    return null;
  }
}

export function createEmotionStateRepository(db: DatabaseInstance) {
  return {
    get(assistantId: string): EmotionStateRecord | null {
      const row = db
        .prepare(
          `SELECT assistant_id, state_json, updated_at
             FROM assistant_emotion_states WHERE assistant_id = ?`,
        )
        .get(assistantId) as EmotionStateRow | undefined;
      return row ? mapRow(row) : null;
    },

    list(): EmotionStateRecord[] {
      const rows = db
        .prepare(
          `SELECT assistant_id, state_json, updated_at
             FROM assistant_emotion_states ORDER BY assistant_id ASC`,
        )
        .all() as EmotionStateRow[];
      const records: EmotionStateRecord[] = [];
      for (const row of rows) {
        const record = mapRow(row);
        if (record) records.push(record);
      }
      return records;
    },

    /**
     * upsert：state.updatedAt（毫秒真值）同步为 ISO 列，保证列与 JSON 不漂移；
     * 助手不存在时由外键约束拒绝。
     */
    upsert(assistantId: string, state: EmotionState): EmotionStateRecord {
      const iso = new Date(state.updatedAt).toISOString();
      db.prepare(
        `INSERT INTO assistant_emotion_states(assistant_id, state_json, updated_at)
         VALUES (@assistantId, @stateJson, @iso)
         ON CONFLICT(assistant_id) DO UPDATE
           SET state_json = excluded.state_json, updated_at = excluded.updated_at`,
      ).run({ assistantId, stateJson: JSON.stringify(state), iso });
      return { assistantId, state, updatedAt: iso };
    },

    delete(assistantId: string): boolean {
      return db.prepare(`DELETE FROM assistant_emotion_states WHERE assistant_id = ?`).run(
        assistantId,
      ).changes > 0;
    },
  };
}

export type EmotionStateRepository = ReturnType<typeof createEmotionStateRepository>;
