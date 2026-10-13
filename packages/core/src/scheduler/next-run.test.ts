import { describe, expect, it } from 'vitest';
import {
  computeNextRunMs,
  isSupportedTimezone,
  resolveFixedOffsetMinutes,
  type ScheduleSpec,
} from './next-run';

const TZ = 'Asia/Shanghai';

/** 构造上海本地时刻的 UTC ms */
function shanghaiMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): number {
  return Date.UTC(year, month - 1, day, hour, minute) - 8 * 3600_000;
}

/** UTC ms → 上海本地分钟序列（断言用） */
function shanghaiParts(ms: number): {
  month: number;
  day: number;
  weekday: number;
  hour: number;
  minute: number;
} {
  const d = new Date(ms + 8 * 3600_000);
  return {
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    weekday: d.getUTCDay(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
}

describe('computeNextRunMs（Asia/Shanghai UTC+8）', () => {
  it('daily：当天时刻未到 → 今天；已过 → 明天', () => {
    const spec: ScheduleSpec = { kind: 'daily', hour: 9, minute: 30, timezone: TZ };
    // 当天 8:00 → 今天 9:30
    const before = shanghaiMs(2026, 10, 14, 8, 0);
    const t1 = computeNextRunMs(spec, before)!;
    expect(shanghaiParts(t1)).toMatchObject({ month: 10, day: 14, hour: 9, minute: 30 });
    expect(t1).toBeGreaterThan(before);

    // 当天 10:00 → 明天 9:30
    const after = shanghaiMs(2026, 10, 14, 10, 0);
    const t2 = computeNextRunMs(spec, after)!;
    expect(shanghaiParts(t2)).toMatchObject({ month: 10, day: 15, hour: 9, minute: 30 });
  });

  it('daily：月末/跨年正确进位', () => {
    const spec: ScheduleSpec = { kind: 'daily', hour: 0, minute: 5, timezone: TZ };
    // 10-31 23:00 → 11-01 00:05
    const t = computeNextRunMs(spec, shanghaiMs(2026, 10, 31, 23, 0))!;
    expect(shanghaiParts(t)).toMatchObject({ month: 11, day: 1, hour: 0, minute: 5 });
    // 12-31 23:00 → 次年 01-01
    const t2 = computeNextRunMs(spec, shanghaiMs(2026, 12, 31, 23, 0))!;
    const d = new Date(t2 + 8 * 3600_000);
    expect(d.getUTCFullYear()).toBe(2027);
    expect(shanghaiParts(t2)).toMatchObject({ month: 1, day: 1, hour: 0, minute: 5 });
  });

  it('weekly：本周未到 → 本周；已过 → 下周；周日=0 口径', () => {
    // 2026-10-14 是周三
    const wed = shanghaiMs(2026, 10, 14, 8, 0);
    expect(shanghaiParts(wed).weekday).toBe(3);

    // 周五（5）20:00：周三早上问 → 本周五
    const fri: ScheduleSpec = { kind: 'weekly', hour: 20, minute: 0, weekday: 5, timezone: TZ };
    const t1 = computeNextRunMs(fri, wed)!;
    expect(shanghaiParts(t1)).toMatchObject({ month: 10, day: 16, hour: 20, minute: 0 });

    // 周一（1）9:00：周三问 → 下周一（10-19）
    const mon: ScheduleSpec = { kind: 'weekly', hour: 9, minute: 0, weekday: 1, timezone: TZ };
    const t2 = computeNextRunMs(mon, wed)!;
    expect(shanghaiParts(t2)).toMatchObject({ month: 10, day: 19, hour: 9, minute: 0 });

    // 周日（0）：周三问 → 本周日（10-18）
    const sun: ScheduleSpec = { kind: 'weekly', hour: 9, minute: 0, weekday: 0, timezone: TZ };
    const t3 = computeNextRunMs(sun, wed)!;
    expect(shanghaiParts(t3)).toMatchObject({ month: 10, day: 18 });
    expect(shanghaiParts(t3).weekday).toBe(0);
  });

  it('weekly：目标日就是今天但时刻已过 → 下周同一天', () => {
    // 周三 20:00 已过，问周三 21:00
    const spec: ScheduleSpec = { kind: 'weekly', hour: 20, minute: 0, weekday: 3, timezone: TZ };
    const t = computeNextRunMs(spec, shanghaiMs(2026, 10, 14, 21, 0))!;
    expect(shanghaiParts(t)).toMatchObject({ month: 10, day: 21, hour: 20, minute: 0 });
  });

  it('once：未来日期 → 当天时刻；已过期/非法 → null', () => {
    const spec: ScheduleSpec = {
      kind: 'once',
      hour: 9,
      minute: 0,
      atDate: '2026-10-20',
      timezone: TZ,
    };
    const t = computeNextRunMs(spec, shanghaiMs(2026, 10, 14, 10, 0))!;
    expect(shanghaiParts(t)).toMatchObject({ month: 10, day: 20, hour: 9, minute: 0 });

    expect(computeNextRunMs(spec, shanghaiMs(2026, 10, 21, 0, 0))).toBeNull();
    expect(
      computeNextRunMs({ ...spec, atDate: '2026-13-40' }, shanghaiMs(2026, 10, 14, 0, 0)),
    ).toBeNull();
    expect(
      computeNextRunMs({ ...spec, atDate: null }, shanghaiMs(2026, 10, 14, 0, 0)),
    ).toBeNull();
  });

  it('严格晚于：目标时刻恰等于 fromMs 也排到下一次', () => {
    const spec: ScheduleSpec = { kind: 'daily', hour: 9, minute: 30, timezone: TZ };
    const exact = shanghaiMs(2026, 10, 14, 9, 30);
    const t = computeNextRunMs(spec, exact)!;
    expect(shanghaiParts(t)).toMatchObject({ day: 15 });
  });

  it('未识别时区回落 +8（Shanghai 别名均识别）', () => {
    expect(resolveFixedOffsetMinutes('America/New_York')).toBe(480);
    expect(isSupportedTimezone('Asia/Shanghai')).toBe(true);
    expect(isSupportedTimezone('Asia/Hong_Kong')).toBe(true);
    expect(isSupportedTimezone('America/New_York')).toBe(false);
    const spec: ScheduleSpec = { kind: 'daily', hour: 9, minute: 0, timezone: 'America/New_York' };
    const t = computeNextRunMs(spec, shanghaiMs(2026, 10, 14, 8, 0))!;
    // 仍按 +8 落点
    expect(shanghaiParts(t)).toMatchObject({ day: 14, hour: 9 });
  });

  it('weekly 缺 weekday 返回 null', () => {
    const spec = { kind: 'weekly', hour: 9, minute: 0, timezone: TZ } as ScheduleSpec;
    expect(computeNextRunMs(spec, shanghaiMs(2026, 10, 14, 8, 0))).toBeNull();
  });
});
