/**
 * v1.6 情绪轨恢复（从 restore-ops 拆出，守 300 行门禁）。
 * 条目：每助手一行 { assistantId, state, events[] }（v1 归档无 events 字段也兼容）。
 */
import {
  emotionStateSchema,
  EMOTION_EVENT_SOURCES,
  EMOTION_PERSISTED_EVENT_TYPES,
  RELATIONSHIP_LEVEL_EVENT_TYPES,
  EXPRESSION_TAGS,
  type EmotionState,
} from '@wbfm/shared/schemas';
import { ApiError } from '@wbfm/shared/errors';

/** 事件流水负载（与 EmotionEventRecord 同构，宽容 unknown 逐项校验） */
interface EmotionEventEntry {
  id: unknown;
  type: unknown;
  source: unknown;
  emotion: unknown;
  intensity: unknown;
  messageId: unknown;
  createdAt: unknown;
}

/** 情绪轨归档负载条目（与 database 的 EmotionStateRecord 同构，state 宽容 unknown 再校验） */
export interface EmotionTrackEntry {
  assistantId: string;
  state: unknown;
  updatedAt?: string;
  events?: EmotionEventEntry[];
}

/** 解析 emotion.json（损坏归档给出与其他轨一致的校验错误） */
export function readEmotionTrackPayload(buf: Buffer): EmotionTrackEntry[] {
  try {
    return JSON.parse(buf.toString('utf-8')) as EmotionTrackEntry[];
  } catch {
    throw new ApiError('VALIDATION_ERROR', 'emotion.json 解析失败，归档可能已损坏');
  }
}

function validEvent(event: EmotionEventEntry): boolean {
  if (typeof event.id !== 'string' || typeof event.createdAt !== 'string') return false;
  const type = event.type as string;
  if (!(EMOTION_PERSISTED_EVENT_TYPES as readonly string[]).includes(type)) return false;
  if (!(EMOTION_EVENT_SOURCES as readonly string[]).includes(event.source as string)) return false;
  const isLevelEvent = (RELATIONSHIP_LEVEL_EVENT_TYPES as readonly string[]).includes(type);
  if (isLevelEvent) {
    // v2.0 等级事件：无表情/无消息外键，intensity=新等级（整数 0–3）
    if (event.emotion !== null && event.emotion !== undefined) return false;
    if (event.messageId !== null && event.messageId !== undefined) return false;
    return (
      typeof event.intensity === 'number' &&
      Number.isInteger(event.intensity) &&
      event.intensity >= 0 &&
      event.intensity <= 3
    );
  }
  if (
    event.emotion !== null &&
    event.emotion !== undefined &&
    !(EXPRESSION_TAGS as readonly string[]).includes(event.emotion as string)
  ) {
    return false;
  }
  if (
    event.intensity !== null &&
    event.intensity !== undefined &&
    (typeof event.intensity !== 'number' || event.intensity < 0 || event.intensity > 1)
  ) {
    return false;
  }
  return true;
}

/**
 * 恢复状态（INSERT OR IGNORE 不覆盖本机关系）+ 事件流水（逐条幂等，
 * 消息外键不存在时由 SQLite 拒绝该事件——跳过计数，不影响状态恢复）。
 */
export function restoreEmotionStates(db: any, entries: EmotionTrackEntry[]): {
  imported: number;
  skipped: number;
} {
  const assistantExists = db.prepare(`SELECT 1 FROM assistants WHERE id = ?`);
  const rowExists = db.prepare(
    `SELECT 1 FROM assistant_emotion_states WHERE assistant_id = ?`,
  );
  const insertState = db.prepare(
    `INSERT OR IGNORE INTO assistant_emotion_states(assistant_id, state_json, updated_at)
     VALUES (?, ?, ?)`,
  );
  const insertEvent = db.prepare(
    `INSERT OR IGNORE INTO emotion_events(
       id, assistant_id, type, source, emotion, intensity, message_id, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  let imported = 0;
  let skipped = 0;
  for (const entry of entries) {
    const parsed = emotionStateSchema.safeParse(entry.state);
    const assistantOk =
      typeof entry.assistantId === 'string' && Boolean(assistantExists.get(entry.assistantId));
    if (!parsed.success || !assistantOk) {
      skipped++;
      continue;
    }
    const state: EmotionState = parsed.data;
    const stateExisted = Boolean(rowExists.get(entry.assistantId));
    if (!stateExisted) {
      insertState.run(
        entry.assistantId,
        JSON.stringify(state),
        new Date(state.updatedAt).toISOString(),
      );
      imported++;
    } else {
      skipped++;
    }

    // 事件：即使状态行已存在也尝试补录（INSERT OR IGNORE，已存在/消息缺失跳过）
    for (const event of entry.events ?? []) {
      if (!validEvent(event)) continue;
      try {
        insertEvent.run(
          event.id,
          entry.assistantId,
          event.type,
          event.source,
          event.emotion ?? null,
          event.intensity ?? null,
          event.messageId ?? null,
          event.createdAt,
        );
      } catch {
        /* 外键（消息不存在）等约束失败：跳过该事件 */
      }
    }
  }
  return { imported, skipped };
}
