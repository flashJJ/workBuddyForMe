/**
 * v1.7 角色化提醒的下一次触发纯函数（见 docs/plan/v1.7/03 §2.1）。
 *
 * 时间口径（M0 冻结）：
 * - 用户编辑本地 hour/minute（+weekday/atDate）；timezone 创建时固化；
 * - 本版只支持 Asia/Shanghai（UTC+8，无 DST）；传入其他 IANA 回落 +8 并由调用方记日志，
 *   避免引入完整 tz database；
 * - daily 跨 DST 不补不跳——按本地 HH:mm 重新落点（固定 +8 下与手机日历一致）；
 * - 返回严格晚于 fromMs 的下一次触发毫秒；once 过期返回 null。
 */

export interface ScheduleSpec {
  kind: 'once' | 'daily' | 'weekly';
  hour: number;
  minute: number;
  /** weekly：0..6（0=周日，JS getDay）；其余 null */
  weekday?: number | null;
  /** once：'YYYY-MM-DD'；其余 null */
  atDate?: string | null;
  /** IANA；本版仅识别 Asia/Shanghai（及等价别名），其余回落 +8 */
  timezone: string;
}

const SHANGHAI_OFFSET_MIN = 8 * 60;
const SHANGHAI_ALIASES = new Set([
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Taipei',
  'Asia/Macau',
  'Asia/Singapore',
  'PRC',
]);

/** 解析固定 UTC 偏移（分钟）；未识别 IANA 回落上海（调用方负责 warn） */
export function resolveFixedOffsetMinutes(timezone: string): number {
  return SHANGHAI_ALIASES.has(timezone) ? SHANGHAI_OFFSET_MIN : SHANGHAI_OFFSET_MIN;
}

/** 时区是否被识别（未识别时 UI/服务应给回落提示） */
export function isSupportedTimezone(timezone: string): boolean {
  return SHANGHAI_ALIASES.has(timezone);
}

/** 取 fromMs 在固定偏移时区下的本地日历分量 */
function localParts(utcMs: number, offsetMin: number): {
  year: number;
  month: number; // 1..12
  day: number;
  weekday: number; // 0..6
  hour: number;
  minute: number;
} {
  const d = new Date(utcMs + offsetMin * 60_000);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    weekday: d.getUTCDay(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
}

/** 由固定偏移时区的本地年月日时分构造 UTC ms */
function utcMsFromLocal(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  offsetMin: number,
): number {
  return Date.UTC(year, month - 1, day, hour, minute, 0, 0) - offsetMin * 60_000;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** YYYY-MM-DD 解析（严格）；非法返回 null */
function parseDate(text: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

/** 主入口：从 fromMs 起算严格晚于当前时刻的下一次触发；once 过期返回 null */
export function computeNextRunMs(spec: ScheduleSpec, fromMs: number): number | null {
  const offset = resolveFixedOffsetMinutes(spec.timezone);
  const local = localParts(fromMs, offset);

  if (spec.kind === 'once') {
    if (!spec.atDate) return null;
    const date = parseDate(spec.atDate);
    if (!date) return null;
    const target = utcMsFromLocal(
      date.year,
      date.month,
      date.day,
      spec.hour,
      spec.minute,
      offset,
    );
    return target > fromMs ? target : null;
  }

  if (spec.kind === 'daily') {
    let candidate = utcMsFromLocal(
      local.year,
      local.month,
      local.day,
      spec.hour,
      spec.minute,
      offset,
    );
    if (candidate <= fromMs) {
      // 推进一天（按月进位）
      let { year, month, day } = local;
      day += 1;
      if (day > daysInMonth(year, month)) {
        day = 1;
        month += 1;
        if (month > 12) {
          month = 1;
          year += 1;
        }
      }
      candidate = utcMsFromLocal(year, month, day, spec.hour, spec.minute, offset);
    }
    return candidate;
  }

  // weekly：找下一个 weekday（0..6）匹配的本地日
  if (typeof spec.weekday !== 'number' || spec.weekday < 0 || spec.weekday > 6) return null;
  let { year, month, day } = local;
  const candidate = utcMsFromLocal(year, month, day, spec.hour, spec.minute, offset);
  // 今天是目标星期但时刻已过（或就是现在，严格晚于）→ 从明天起找
  let deltaDays = (spec.weekday - local.weekday + 7) % 7;
  if (deltaDays === 0 && candidate <= fromMs) deltaDays = 7;
  for (let i = 0; i < deltaDays; i += 1) {
    day += 1;
    if (day > daysInMonth(year, month)) {
      day = 1;
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
  }
  return utcMsFromLocal(year, month, day, spec.hour, spec.minute, offset);
}
