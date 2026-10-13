import type { DatabaseInstance } from '../client';
import { newId } from './mapper/common';
import {
  EVENT_RUN_OUTCOMES,
  EVENT_SUPPRESS_REASONS,
  type EventRunOutcome,
} from '@wbfm/shared/schemas';

export interface EventUsageRecord {
  id: string;
  assistantId: string;
  eventId: string;
  /** 本地日界 YYYY-MM-DD */
  dateKey: string;
  /** ISO UTC */
  playedAt: string;
  outcome: EventRunOutcome;
  reason: string | null;
  priority: number;
}

export interface AppendEventUsageInput {
  id?: string;
  eventId: string;
  dateKey: string;
  /** 事件时刻毫秒 */
  playedAtMs: number;
  outcome: EventRunOutcome;
  /** suppressed 时必须为白名单原因码；其余终态可为 user_skip/watchdog 等 */
  reason?: string | null;
  priority: number;
}

interface RawRow {
  id: string;
  assistant_id: string;
  event_id: string;
  date_key: string;
  played_at: string;
  outcome: string;
  reason: string | null;
  priority: number;
}

function mapRow(row: RawRow): EventUsageRecord | null {
  if (!(EVENT_RUN_OUTCOMES as readonly string[]).includes(row.outcome)) return null;
  if (
    row.reason !== null &&
    row.outcome === 'suppressed' &&
    !(EVENT_SUPPRESS_REASONS as readonly string[]).includes(row.reason)
  ) {
    return null;
  }
  return {
    id: row.id,
    assistantId: row.assistant_id,
    eventId: row.event_id,
    dateKey: row.date_key,
    playedAt: row.played_at,
    outcome: row.outcome as EventRunOutcome,
    reason: row.reason,
    priority: row.priority,
  };
}

/** 打扰率统计窗口 */
export interface EventUsageStats {
  played: number;
  skipped: number;
  interrupted: number;
  suppressed: number;
}

export function createEventUsageRepository(db: DatabaseInstance) {
  return {
    append(assistantId: string, input: AppendEventUsageInput): EventUsageRecord {
      // suppressed 的原因码必须在白名单（DB CHECK 只锁 outcome）
      if (
        input.outcome === 'suppressed' &&
        !(EVENT_SUPPRESS_REASONS as readonly string[]).includes(input.reason ?? '')
      ) {
        throw new Error(`非法 suppressed 原因码: ${input.reason ?? ''}`);
      }
      const record: EventUsageRecord = {
        id: input.id ?? newId(),
        assistantId,
        eventId: input.eventId,
        dateKey: input.dateKey,
        playedAt: new Date(input.playedAtMs).toISOString(),
        outcome: input.outcome,
        reason: input.reason ?? null,
        priority: input.priority,
      };
      db.prepare(
        `INSERT INTO event_usage(
           id, assistant_id, event_id, date_key, played_at, outcome, reason, priority)
         VALUES (
           @id, @assistantId, @eventId, @dateKey, @playedAt, @outcome, @reason, @priority)`,
      ).run({
        id: record.id,
        assistantId: record.assistantId,
        eventId: record.eventId,
        dateKey: record.dateKey,
        playedAt: record.playedAt,
        outcome: record.outcome,
        reason: record.reason,
        priority: record.priority,
      });
      return record;
    },

    /** 冷却闸门：只看 outcome='played' 的最近时刻（ms）；无记录 null */
    lastPlayedAt(assistantId: string, eventId: string): number | null {
      const row = db
        .prepare(
          `SELECT played_at AS playedAt FROM event_usage
            WHERE assistant_id = ? AND event_id = ? AND outcome = 'played'
            ORDER BY played_at DESC LIMIT 1`,
        )
        .get(assistantId, eventId) as { playedAt: string } | undefined;
      if (!row) return null;
      const ms = Date.parse(row.playedAt);
      return Number.isFinite(ms) ? ms : null;
    },

    /** 每日上限：同 event_id+date_key 且 played 的条数 */
    countPlayedToday(assistantId: string, eventId: string, dateKey: string): number {
      const row = db
        .prepare(
          `SELECT COUNT(*) AS n FROM event_usage
            WHERE assistant_id = ? AND event_id = ? AND date_key = ? AND outcome = 'played'`,
        )
        .get(assistantId, eventId, dateKey) as { n: number };
      return row.n;
    },

    /**
     * 渲染进程导演初始化快照：每剧本一行（lastPlayedMs + 今日 played 计数）。
     * 单次往返避免每剧本一次 GET。
     */
    snapshot(
      assistantId: string,
      dateKey: string,
    ): Array<{ eventId: string; lastPlayedAt: number | null; playedToday: number }> {
      const rows = db
        .prepare(
          `SELECT event_id AS eventId,
                  MAX(CASE WHEN outcome='played' THEN played_at END) AS lastPlayed,
                  SUM(CASE WHEN outcome='played' AND date_key = ? THEN 1 ELSE 0 END) AS playedToday
             FROM event_usage
            WHERE assistant_id = ?
            GROUP BY event_id`,
        )
        .all(dateKey, assistantId) as Array<{
          eventId: string;
          lastPlayed: string | null;
          playedToday: number;
        }>;
      return rows.map((row) => {
        const ms = row.lastPlayed ? Date.parse(row.lastPlayed) : NaN;
        return {
          eventId: row.eventId,
          lastPlayedAt: Number.isFinite(ms) ? ms : null,
          playedToday: row.playedToday,
        };
      });
    },

    stats(assistantId: string, sinceMs: number): EventUsageStats {
      const since = new Date(sinceMs).toISOString();
      const rows = db
        .prepare(
          `SELECT outcome, COUNT(*) AS n FROM event_usage
            WHERE assistant_id = ? AND played_at >= ?
            GROUP BY outcome`,
        )
        .all(assistantId, since) as Array<{ outcome: string; n: number }>;
      const stats: EventUsageStats = { played: 0, skipped: 0, interrupted: 0, suppressed: 0 };
      for (const row of rows) {
        if (row.outcome === 'played' || row.outcome === 'skipped' ||
            row.outcome === 'interrupted' || row.outcome === 'suppressed') {
          stats[row.outcome] = row.n;
        }
      }
      return stats;
    },

    /** 保留策略：清理 cutoffMs 之前流水，返回删除条数 */
    purgeBefore(cutoffMs: number): number {
      return db
        .prepare(`DELETE FROM event_usage WHERE played_at < ?`)
        .run(new Date(cutoffMs).toISOString()).changes;
    },

    listAll(opts?: { sinceMs?: number; assistantId?: string }): EventUsageRecord[] {
      const where: string[] = [];
      const params: unknown[] = [];
      if (opts?.assistantId) {
        where.push('assistant_id = ?');
        params.push(opts.assistantId);
      }
      if (opts?.sinceMs !== undefined) {
        where.push('played_at >= ?');
        params.push(new Date(opts.sinceMs).toISOString());
      }
      const sql = `SELECT * FROM event_usage ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
                    ORDER BY played_at ASC, id ASC`;
      const rows = db.prepare(sql).all(...params) as RawRow[];
      return rows.map(mapRow).filter((r): r is EventUsageRecord => r !== null);
    },

    restoreOne(assistantId: string, record: Omit<EventUsageRecord, 'assistantId'>): boolean {
      const result = db
        .prepare(
          `INSERT OR IGNORE INTO event_usage(
             id, assistant_id, event_id, date_key, played_at, outcome, reason, priority)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          record.id,
          assistantId,
          record.eventId,
          record.dateKey,
          record.playedAt,
          record.outcome,
          record.reason,
          record.priority,
        );
      return result.changes > 0;
    },
  };
}

export type EventUsageRepository = ReturnType<typeof createEventUsageRepository>;
