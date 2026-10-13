import type { DatabaseInstance } from '../client';
import { newId, nowIso } from './mappers';
import type {
  EventTriggerCreateInput,
  EventTriggerUpdateInput,
  EventTriggerView,
} from '@wbfm/shared/schemas';

interface EventTriggerRow {
  id: string;
  assistant_id: string;
  event_id: string;
  phrases_json: string;
  cooldown_ms: number;
  start_hour: number;
  end_hour: number;
  max_per_day: number;
  min_intimacy: number;
  enabled: number;
  created_at: string;
  updated_at: string;
}

function mapRow(row: EventTriggerRow): EventTriggerView {
  let phrases: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.phrases_json);
    if (Array.isArray(parsed)) phrases = parsed.filter((p): p is string => typeof p === 'string');
  } catch {
    phrases = [];
  }
  return {
    id: row.id,
    assistantId: row.assistant_id,
    eventId: row.event_id,
    phrases,
    cooldownMs: row.cooldown_ms,
    startHour: row.start_hour,
    endHour: row.end_hour,
    maxPerDay: row.max_per_day,
    minIntimacy: row.min_intimacy,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface EventTriggerRepository {
  create(input: EventTriggerCreateInput): EventTriggerView;
  update(id: string, patch: EventTriggerUpdateInput): EventTriggerView | null;
  delete(id: string): boolean;
  findById(id: string): EventTriggerView | null;
  list(assistantId?: string): EventTriggerView[];
  /** 触发匹配用：某助手名下启用的全部规则 */
  listEnabledByAssistant(assistantId: string): EventTriggerView[];
}

export function createEventTriggerRepository(db: DatabaseInstance): EventTriggerRepository {
  return {
    create(input) {
      const id = newId();
      const ts = nowIso();
      db.prepare(
        `INSERT INTO event_triggers(
           id, assistant_id, event_id, phrases_json, cooldown_ms, start_hour, end_hour,
           max_per_day, min_intimacy, enabled, created_at, updated_at)
         VALUES (
           @id, @assistantId, @eventId, @phrases, @cooldownMs, @startHour, @endHour,
           @maxPerDay, @minIntimacy, @enabled, @ts, @ts)`,
      ).run({
        id,
        assistantId: input.assistantId,
        eventId: input.eventId,
        phrases: JSON.stringify(input.phrases),
        cooldownMs: input.cooldownMs,
        startHour: input.startHour,
        endHour: input.endHour,
        maxPerDay: input.maxPerDay,
        minIntimacy: input.minIntimacy,
        enabled: input.enabled ? 1 : 0,
        ts,
      });
      return this.findById(id)!;
    },

    update(id, patch) {
      const existing = this.findById(id);
      if (!existing) return null;
      const next: EventTriggerView = { ...existing, ...patch, updatedAt: nowIso() };
      db.prepare(
        `UPDATE event_triggers SET
           event_id=@eventId, phrases_json=@phrases, cooldown_ms=@cooldownMs,
           start_hour=@startHour, end_hour=@endHour, max_per_day=@maxPerDay,
           min_intimacy=@minIntimacy, enabled=@enabled, updated_at=@updatedAt
         WHERE id=@id`,
      ).run({
        id,
        eventId: next.eventId,
        phrases: JSON.stringify(next.phrases),
        cooldownMs: next.cooldownMs,
        startHour: next.startHour,
        endHour: next.endHour,
        maxPerDay: next.maxPerDay,
        minIntimacy: next.minIntimacy,
        enabled: next.enabled ? 1 : 0,
        updatedAt: next.updatedAt,
      });
      return this.findById(id);
    },

    delete(id) {
      const result = db.prepare(`DELETE FROM event_triggers WHERE id = ?`).run(id);
      return result.changes > 0;
    },

    findById(id) {
      const row = db.prepare(`SELECT * FROM event_triggers WHERE id = ?`).get(id) as
        | EventTriggerRow
        | undefined;
      return row ? mapRow(row) : null;
    },

    list(assistantId) {
      const rows = assistantId
        ? (db
            .prepare(`SELECT * FROM event_triggers WHERE assistant_id = ? ORDER BY created_at ASC`)
            .all(assistantId) as EventTriggerRow[])
        : (db
            .prepare(`SELECT * FROM event_triggers ORDER BY created_at ASC`)
            .all() as EventTriggerRow[]);
      return rows.map(mapRow);
    },

    listEnabledByAssistant(assistantId) {
      const rows = db
        .prepare(
          `SELECT * FROM event_triggers WHERE assistant_id = ? AND enabled = 1 ORDER BY created_at ASC`,
        )
        .all(assistantId) as EventTriggerRow[];
      return rows.map(mapRow);
    },
  };
}
