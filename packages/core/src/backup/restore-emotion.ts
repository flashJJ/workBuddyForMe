/**
 * v1.6 情绪轨恢复（从 restore-ops 拆出，守 300 行门禁）。
 */
import { emotionStateSchema, type EmotionState } from '@wbfm/shared/schemas';
import { ApiError } from '@wbfm/shared/errors';

/** 情绪轨归档负载条目（与 database 的 EmotionStateRecord 同构，state 宽容 unknown 再校验） */
export interface EmotionTrackEntry {
  assistantId: string;
  state: unknown;
  updatedAt?: string;
}

/** 解析 emotion.json（损坏归档给出与其他轨一致的校验错误） */
export function readEmotionTrackPayload(buf: Buffer): EmotionTrackEntry[] {
  try {
    return JSON.parse(buf.toString('utf-8')) as EmotionTrackEntry[];
  } catch {
    throw new ApiError('VALIDATION_ERROR', 'emotion.json 解析失败，归档可能已损坏');
  }
}

/**
 * assistant_emotion_states：INSERT OR IGNORE 幂等跳过（不覆盖本机已形成的关系）。
 * 外键校验：助手必须存在（自定义助手不在备份范围，缺失即跳过）；
 * 状态 JSON 必须通过当前契约校验，损坏条目跳过计数。
 */
export function restoreEmotionStates(db: any, entries: EmotionTrackEntry[]): {
  imported: number;
  skipped: number;
} {
  const assistantExists = db.prepare(`SELECT 1 FROM assistants WHERE id = ?`);
  const rowExists = db.prepare(
    `SELECT 1 FROM assistant_emotion_states WHERE assistant_id = ?`,
  );
  const insert = db.prepare(
    `INSERT OR IGNORE INTO assistant_emotion_states(assistant_id, state_json, updated_at)
     VALUES (?, ?, ?)`,
  );
  let imported = 0;
  let skipped = 0;
  for (const entry of entries) {
    const parsed = emotionStateSchema.safeParse(entry.state);
    if (
      !parsed.success ||
      typeof entry.assistantId !== 'string' ||
      !assistantExists.get(entry.assistantId) ||
      rowExists.get(entry.assistantId)
    ) {
      skipped++;
      continue;
    }
    const state: EmotionState = parsed.data;
    insert.run(entry.assistantId, JSON.stringify(state), new Date(state.updatedAt).toISOString());
    imported++;
  }
  return { imported, skipped };
}
