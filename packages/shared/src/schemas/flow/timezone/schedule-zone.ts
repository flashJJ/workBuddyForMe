import { CronError, cronDayMatches, isValidTimeZone, type CronSpec } from '../schedule';

/**
 * v4.26：按 IANA 时区计算 cron 的下一次执行时间。
 *
 * 零依赖，基于 Node/Electron 内置 Intl：
 * - 先把「此刻」换算为目标时区的墙钟，在墙钟域做 cron 跳进；
 * - 再把候选墙钟换算回 UTC，并回读校验（DST 跳跃中不存在的时刻直接跳过）；
 * - 秋季重复的墙钟只执行一次。
 */

const MAX_SEARCH_YEARS = 5;
const MAX_CANDIDATES = 5000;
const FORMATTER_CACHE_MAX = 100;

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterOf(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  if (formatterCache.size >= FORMATTER_CACHE_MAX) formatterCache.clear();
  formatterCache.set(timeZone, formatter);
  return formatter;
}

function zonedParts(instantMs: number, timeZone: string): ZonedParts {
  const raw: Record<string, number> = {};
  for (const part of formatterOf(timeZone).formatToParts(new Date(instantMs))) {
    if (part.type !== 'literal') raw[part.type] = Number(part.value);
  }
  return {
    year: raw.year!,
    month: raw.month!,
    day: raw.day!,
    hour: raw.hour === 24 ? 0 : raw.hour!,
    minute: raw.minute!,
    second: raw.second!,
  };
}

/** 瞬时 → 目标时区墙钟毫秒（用 UTC 字段承载墙钟） */
function wallMsOf(instantMs: number, timeZone: string): number {
  const parts = zonedParts(instantMs, timeZone);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

function offsetMsAt(instantMs: number, timeZone: string): number {
  const floored = Math.floor(instantMs / 1000) * 1000;
  return wallMsOf(floored, timeZone) - floored;
}

/** 墙钟 → 瞬时；两次迭代收敛到 DST 切换后的偏移 */
function wallToInstant(wallMs: number, timeZone: string): number {
  const first = wallMs - offsetMsAt(wallMs, timeZone);
  return wallMs - offsetMsAt(first, timeZone);
}

/** 在墙钟域找严格晚于 wallMs 的下一个 cron 候选；5 年无解抛错 */
function nextWallCandidate(spec: CronSpec, wallMs: number): number {
  const cursor = new Date(wallMs);
  cursor.setUTCSeconds(0, 0);
  cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  const limit = wallMs + MAX_SEARCH_YEARS * 366 * 24 * 3600 * 1000;

  while (cursor.getTime() <= limit) {
    if (!spec.months.has(cursor.getUTCMonth() + 1)) {
      cursor.setUTCMonth(cursor.getUTCMonth() + 1, 1);
      cursor.setUTCHours(0, 0, 0, 0);
      continue;
    }
    if (
      !cronDayMatches(
        spec,
        cursor.getUTCMonth() + 1,
        cursor.getUTCDate(),
        cursor.getUTCDay(),
      )
    ) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      cursor.setUTCHours(0, 0, 0, 0);
      continue;
    }
    if (!spec.hours.has(cursor.getUTCHours())) {
      cursor.setUTCHours(cursor.getUTCHours() + 1, 0, 0, 0);
      continue;
    }
    if (!spec.minutes.has(cursor.getUTCMinutes())) {
      cursor.setUTCMinutes(cursor.getUTCMinutes() + 1, 0, 0);
      continue;
    }
    return cursor.getTime();
  }
  throw new CronError('未来 5 年内没有匹配的执行时间');
}

/** 严格晚于 from、按 timeZone 解释 cron 的下一次执行时间 */
export function nextCronTimeInZone(spec: CronSpec, from: Date, timeZone: string): Date {
  if (!isValidTimeZone(timeZone)) throw new CronError(`未知时区：${timeZone}`);
  const fromMs = from.getTime();
  let wall = wallMsOf(fromMs, timeZone);
  for (let index = 0; index < MAX_CANDIDATES; index += 1) {
    wall = nextWallCandidate(spec, wall);
    const instant = wallToInstant(wall, timeZone);
    if (instant <= fromMs) continue;
    // 回读不一致说明该墙钟落在 DST 跳跃的空洞里，继续下一个候选
    if (wallMsOf(instant, timeZone) !== wall) continue;
    return new Date(instant);
  }
  throw new CronError('未来 5 年内没有匹配的执行时间');
}
