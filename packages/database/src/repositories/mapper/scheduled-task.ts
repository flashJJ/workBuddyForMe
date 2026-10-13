import type { ScheduledTaskView } from '@wbfm/shared/schemas';

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
  created_at: string;
  updated_at: string;
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
