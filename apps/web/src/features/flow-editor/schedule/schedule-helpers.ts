import type { FlowScheduleView } from '@wbfm/shared/types';

/** v4.26 定时列表展示与默认值 */

export const TIMEZONE_OPTIONS = [
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
] as const;

export interface ScheduleDraft {
  name: string;
  cron: string;
  timezone: string;
  enabled: boolean;
}

export const EMPTY_SCHEDULE_DRAFT: ScheduleDraft = {
  name: '',
  cron: '0 9 * * *',
  timezone: 'Asia/Shanghai',
  enabled: true,
};

/** 常见时区；编辑中的值不在列表时追加到首位，避免下拉丢失当前值 */
export function timezoneOptionsFor(current?: string | null): string[] {
  const options: string[] = [...TIMEZONE_OPTIONS];
  if (current && !options.includes(current)) return [current, ...options];
  return options;
}

/** 是否属于常用时区列表 */
export function isCommonTimezone(timeZone: string): boolean {
  return (TIMEZONE_OPTIONS as readonly string[]).includes(timeZone);
}

/** 与 shared 侧同口径：Intl 能识别的 IANA 名称 */
export function isValidIanaTimeZone(timeZone: string): boolean {
  const value = timeZone.trim();
  if (!value) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** 名称为空时用 cron 作为标题 */
export function scheduleLabel(schedule: Pick<FlowScheduleView, 'name' | 'cron'>): string {
  return schedule.name.trim() || schedule.cron;
}

/** 按定时自身时区展示，避免浏览器本地时区与配置时区不一致时误读 */
export function formatScheduleTime(iso: string | null, timeZone?: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, timeZone ? { timeZone, timeZoneName: 'short' } : undefined);
}
