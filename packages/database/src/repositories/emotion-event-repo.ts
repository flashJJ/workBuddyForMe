import type { DatabaseInstance } from '../client';
import {
  EMOTION_EVENT_SOURCES,
  EMOTION_PERSISTED_EVENT_TYPES,
  EXPRESSION_TAGS,
  type EmotionEventSource,
  type EmotionEventView,
  type EmotionPersistedEventType,
  type ExpressionTag,
} from '@wbfm/shared/schemas';

/** 情绪事件流水行（不含对话原文） */
export interface EmotionEventRow {
  id: string;
  assistant_id: string;
  type: string;
  source: string;
  emotion: string | null;
  intensity: number | null;
  message_id: string | null;
  created_at: string;
}

/** 仓储层事件记录：即 shared 的 wire 视图（ISO 时间字符串，无对话原文） */
export type EmotionEventRecord = EmotionEventView;

export interface AddEmotionEventInput {
  id: string;
  /** soulEvent 四类或 v2.0 等级变迁（level_up/down 时 intensity=新等级 0–3） */
  type: EmotionPersistedEventType;
  source: EmotionEventSource;
  emotion?: ExpressionTag | null;
  intensity?: number | null;
  messageId?: string | null;
  /** 事件时刻毫秒 */
  timestampMs: number;
}

function mapRow(row: EmotionEventRow): EmotionEventRecord | null {
  if (!(EMOTION_PERSISTED_EVENT_TYPES as readonly string[]).includes(row.type)) return null;
  if (!(EMOTION_EVENT_SOURCES as readonly string[]).includes(row.source)) return null;
  const isLevelEvent = row.type === 'level_up' || row.type === 'level_down';
  if (isLevelEvent) {
    // 等级事件：无表情/无消息外键，intensity=新等级（整数 0–3）
    if (row.emotion !== null || row.message_id !== null) return null;
    if (
      row.intensity === null ||
      !Number.isInteger(row.intensity) ||
      row.intensity < 0 ||
      row.intensity > 3
    ) {
      return null;
    }
  } else if (
    row.emotion !== null &&
    !(EXPRESSION_TAGS as readonly string[]).includes(row.emotion)
  ) {
    return null;
  }
  if (
    !isLevelEvent &&
    row.intensity !== null &&
    (!Number.isFinite(row.intensity) || row.intensity < 0 || row.intensity > 1)
  ) {
    return null;
  }
  return {
    id: row.id,
    assistantId: row.assistant_id,
    type: row.type as EmotionPersistedEventType,
    source: row.source as EmotionEventSource,
    emotion: row.emotion as ExpressionTag | null,
    intensity: row.intensity,
    messageId: row.message_id,
    createdAt: row.created_at,
  };
}

export function createEmotionEventRepository(db: DatabaseInstance) {
  return {
    add(assistantId: string, input: AddEmotionEventInput): void {
      db.prepare(
        `INSERT INTO emotion_events(
           id, assistant_id, type, source, emotion, intensity, message_id, created_at
         ) VALUES (
           @id, @assistantId, @type, @source, @emotion, @intensity, @messageId, @createdAt
         )`,
      ).run({
        id: input.id,
        assistantId,
        type: input.type,
        source: input.source,
        emotion: input.emotion ?? null,
        intensity: input.intensity ?? null,
        messageId: input.messageId ?? null,
        createdAt: new Date(input.timestampMs).toISOString(),
      });
    },

    /** 最近事件（按时间倒序，默认 20 条） */
    listByAssistant(assistantId: string, limit = 20): EmotionEventRecord[] {
      const rows = db
        .prepare(
          `SELECT id, assistant_id, type, source, emotion, intensity, message_id, created_at
             FROM emotion_events WHERE assistant_id = ?
             ORDER BY created_at DESC, id DESC LIMIT ?`,
        )
        .all(assistantId, limit) as EmotionEventRow[];
      const records: EmotionEventRecord[] = [];
      for (const row of rows) {
        const record = mapRow(row);
        if (record) records.push(record);
      }
      return records;
    },

    /** 备份用：全表按助手分组导出（表小，一次读取） */
    listAll(): EmotionEventRecord[] {
      const rows = db
        .prepare(
          `SELECT id, assistant_id, type, source, emotion, intensity, message_id, created_at
             FROM emotion_events ORDER BY created_at ASC, id ASC`,
        )
        .all() as EmotionEventRow[];
      const records: EmotionEventRecord[] = [];
      for (const row of rows) {
        const record = mapRow(row);
        if (record) records.push(record);
      }
      return records;
    },

    /** 备份恢复：幂等插入（已存在的 id 跳过）；助手/消息不存在由外键处理 */
    restoreOne(assistantId: string, record: Omit<EmotionEventRecord, 'assistantId'>): void {
      db.prepare(
        `INSERT OR IGNORE INTO emotion_events(
           id, assistant_id, type, source, emotion, intensity, message_id, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        record.id,
        assistantId,
        record.type,
        record.source,
        record.emotion,
        record.intensity,
        record.messageId,
        record.createdAt,
      );
    },

    deleteByAssistant(assistantId: string): number {
      return db.prepare(`DELETE FROM emotion_events WHERE assistant_id = ?`).run(assistantId)
        .changes;
    },
  };
}

export type EmotionEventRepository = ReturnType<typeof createEmotionEventRepository>;
