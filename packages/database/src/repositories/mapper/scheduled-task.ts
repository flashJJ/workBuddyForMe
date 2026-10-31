import {
  scheduledTaskPayloadSchema,
  type ScheduledTaskPayload,
  type ScheduledTaskView,
} from '@wbfm/shared/schemas';

/** scheduled_tasks 表行（蛇形列名；见 v024 迁移） */
export interface ScheduledTaskRow {
  id: string;
  assistant_id: string;
  kind: string;
  hour: number;
  minute: number;
  weekday: number | null;
  at_date: string | null;
  timezone: string;
  text: string;
  enabled: number;
  next_run_at: string;
  last_fired_at: string | null;
  /** v2.8：跟进上下文 JSON（空=普通提醒） */
  payload_json: string | null;
  created_at: string;
  updated_at: string;
}

function parsePayload(raw: string | null): ScheduledTaskPayload | null {
  if (!raw) return null;
  try {
    const parsed = scheduledTaskPayloadSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** 行 → 对外视图（布尔/enum 归一；非法 kind 由 zod/CHECK 在边界拦截） */
export function mapScheduledTask(row: ScheduledTaskRow): ScheduledTaskView {
  return {
    id: row.id,
    assistantId: row.assistant_id,
    kind: row.kind as ScheduledTaskView['kind'],
    hour: row.hour,
    minute: row.minute,
    weekday: row.weekday,
    atDate: row.at_date,
    timezone: row.timezone,
    text: row.text,
    enabled: row.enabled === 1,
    nextRunAt: row.next_run_at,
    lastFiredAt: row.last_fired_at,
    payload: parsePayload(row.payload_json ?? null),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
