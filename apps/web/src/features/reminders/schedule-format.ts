/**
 * v1.7 提醒表单时间工具（纯函数，无 React）。
 * 存储口径：hour/minute 为 Asia/Shanghai 墙钟；weekly weekday 用 JS getDay（0=周日）。
 */

export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** hour/minute → <input type="time"> 值 HH:MM */
export function toTimeValue(hour: number, minute: number): string {
  return `${pad2(hour)}:${pad2(minute)}`;
}

/** HH:MM → [hour, minute]；非法返回 null */
export function parseTimeValue(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

/** 今天的 YYYY-MM-DD（本地时区；once 的 date 仅做 UI 选择，服务端按 +8 解释） */
export function todayDateValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}
