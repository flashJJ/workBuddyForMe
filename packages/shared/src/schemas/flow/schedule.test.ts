import { describe, expect, it } from 'vitest';
import {
  CronError,
  FLOW_SCHEDULE_LIMIT,
  cronMatches,
  flowScheduleCreateSchema,
  flowScheduleUpdateSchema,
  nextCronTime,
  parseCron,
  validateCron,
} from './schedule';

describe('parseCron（5 字段 cron）', () => {
  it('通配与列表', () => {
    const spec = parseCron('* * * * *');
    expect(spec.minutes.size).toBe(60);
    expect(spec.daysOfWeek.size).toBe(7);
    expect(spec.domRestricted).toBe(false);
    expect(spec.dowRestricted).toBe(false);

    const list = parseCron('0,15,30 9 * * 1,3,5');
    expect([...list.minutes]).toEqual([0, 15, 30]);
    expect([...list.daysOfWeek]).toEqual([1, 3, 5]);
  });

  it('范围与步长', () => {
    const spec = parseCron('*/15 8-18/2 1-10/3 * *');
    expect([...spec.minutes]).toEqual([0, 15, 30, 45]);
    expect([...spec.hours]).toEqual([8, 10, 12, 14, 16, 18]);
    expect([...spec.daysOfMonth]).toEqual([1, 4, 7, 10]);
  });

  it('周字段 7 归一为周日', () => {
    expect([...parseCron('0 0 * * 7').daysOfWeek]).toEqual([0]);
  });

  it('非法表达式给出可读错误', () => {
    expect(() => parseCron('* * * *')).toThrow(CronError);
    expect(() => parseCron('60 * * * *')).toThrow(/分钟/);
    expect(() => parseCron('* * 0 * *')).toThrow(/日/);
    expect(() => parseCron('* * * * 8')).toThrow(/星期/);
    expect(() => parseCron('*/0 * * * *')).toThrow(/步长/);
    expect(() => parseCron('5-1 * * * *')).toThrow(/范围/);
  });

  it('validateCron 规范化空白', () => {
    expect(validateCron('  0   9   *  *  * ')).toBe('0 9 * * *');
  });
});

describe('nextCronTime / cronMatches（本地时区）', () => {
  const local = (y: number, m: number, d: number, h: number, min: number) =>
    new Date(y, m - 1, d, h, min, 0, 0);

  it('每分钟表达式返回下一分钟', () => {
    const spec = parseCron('* * * * *');
    expect(nextCronTime(spec, local(2026, 11, 23, 10, 30))).toEqual(local(2026, 11, 23, 10, 31));
  });

  it('跳到下一个命中小时与分钟', () => {
    const spec = parseCron('15 9 * * *');
    expect(nextCronTime(spec, local(2026, 11, 23, 10, 30))).toEqual(local(2026, 11, 24, 9, 15));
  });

  it('跨月与跨年', () => {
    const monthly = parseCron('0 0 1 * *');
    expect(nextCronTime(monthly, local(2026, 12, 31, 23, 59))).toEqual(local(2027, 1, 1, 0, 0));
  });

  it('日与周都受限时任一匹配', () => {
    const spec = parseCron('0 0 1 * 1'); // 每月 1 号或每周一
    expect(dayMatches(spec, local(2026, 11, 2, 0, 0))).toBe(true); // 周一
    expect(dayMatches(spec, local(2026, 12, 1, 0, 0))).toBe(true); // 1 号
    expect(dayMatches(spec, local(2026, 11, 25, 0, 0))).toBe(false); // 周三且非 1 号
  });

  it('cronMatches 忽略秒', () => {
    const spec = parseCron('30 8 * * *');
    expect(cronMatches(spec, new Date(2026, 10, 23, 8, 30, 45))).toBe(true);
    expect(cronMatches(spec, new Date(2026, 10, 23, 8, 31, 0))).toBe(false);
  });

  it('无解表达式抛错', () => {
    // 2 月 30 日永远不存在
    const spec = parseCron('0 0 30 2 *');
    expect(() => nextCronTime(spec, local(2026, 1, 1, 0, 0))).toThrow(CronError);
  });
});

function dayMatches(spec: ReturnType<typeof parseCron>, date: Date): boolean {
  return cronMatches(spec, date);
}

describe('flowSchedule schemas（v4.26）', () => {
  it('创建默认时区为 Asia/Shanghai、默认启用', () => {
    const parsed = flowScheduleCreateSchema.parse({ cron: '0 9 * * *' });
    expect(parsed.timezone).toBe('Asia/Shanghai');
    expect(parsed.enabled).toBe(true);
    expect(FLOW_SCHEDULE_LIMIT).toBe(5);
  });

  it('拒绝非法 cron 与未知时区', () => {
    expect(flowScheduleCreateSchema.safeParse({ cron: '60 * * * *' }).success).toBe(false);
    expect(
      flowScheduleCreateSchema.safeParse({ cron: '0 9 * * *', timezone: 'Mars/Olympus' }).success,
    ).toBe(false);
  });

  it('更新至少一个字段，允许 input=null 清空', () => {
    expect(flowScheduleUpdateSchema.safeParse({}).success).toBe(false);
    const parsed = flowScheduleUpdateSchema.parse({ input: null });
    expect(parsed.input).toBeNull();
    expect(flowScheduleUpdateSchema.safeParse({ timezone: 'Mars/Olympus' }).success).toBe(false);
  });
});
