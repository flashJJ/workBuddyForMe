import { describe, expect, it } from 'vitest';
import { CronError, isValidTimeZone, parseCron } from '../schedule';
import { nextCronTimeInZone } from './schedule-zone';

const iso = (value: string) => new Date(value);

describe('isValidTimeZone', () => {
  it('识别常见 IANA 时区与 UTC', () => {
    expect(isValidTimeZone('Asia/Shanghai')).toBe(true);
    expect(isValidTimeZone('America/New_York')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });
});

describe('nextCronTimeInZone', () => {
  it('按目标时区解释每日 9 点（上海）', () => {
    const next = nextCronTimeInZone(
      parseCron('0 9 * * *'),
      iso('2026-11-23T02:00:00.000Z'), // 上海 10:00
      'Asia/Shanghai',
    );
    expect(next.toISOString()).toBe('2026-11-24T01:00:00.000Z');
  });

  it('按目标时区解释每日 9 点（纽约，EST）', () => {
    const next = nextCronTimeInZone(
      parseCron('0 9 * * *'),
      iso('2026-01-15T00:00:00.000Z'), // 纽约 1 月 14 日 19:00
      'America/New_York',
    );
    expect(next.toISOString()).toBe('2026-01-15T14:00:00.000Z');
  });

  it('春季 DST 不存在的 02:30 被跳过', () => {
    const next = nextCronTimeInZone(
      parseCron('30 2 * * *'),
      iso('2026-03-07T12:00:00.000Z'), // 纽约 3 月 7 日 07:00
      'America/New_York',
    );
    // 3 月 8 日 02:30 不存在，顺延到 3 月 9 日 02:30 EDT
    expect(next.toISOString()).toBe('2026-03-09T06:30:00.000Z');
  });

  it('秋季重复的 01:30 只执行一次', () => {
    const spec = parseCron('30 1 * * *');
    const first = nextCronTimeInZone(spec, iso('2026-10-31T12:00:00.000Z'), 'America/New_York');
    expect(first.toISOString()).toBe('2026-11-01T05:30:00.000Z'); // 01:30 EDT

    const second = nextCronTimeInZone(spec, first, 'America/New_York');
    expect(second.toISOString()).toBe('2026-11-02T06:30:00.000Z'); // 次日 01:30 EST
  });

  it('半小时偏移时区（Asia/Kolkata）', () => {
    const next = nextCronTimeInZone(
      parseCron('0 9 * * *'),
      iso('2026-11-23T00:00:00.000Z'), // 印度 05:30
      'Asia/Kolkata',
    );
    expect(next.toISOString()).toBe('2026-11-23T03:30:00.000Z');
  });

  it('欧洲 DST 跳跃同样跳过不存在的 02:30', () => {
    const next = nextCronTimeInZone(
      parseCron('30 2 * * *'),
      iso('2026-03-28T12:00:00.000Z'), // 柏林 3 月 28 日 13:00
      'Europe/Berlin',
    );
    expect(next.toISOString()).toBe('2026-03-30T00:30:00.000Z');
  });

  it('严格晚于当前时刻', () => {
    const from = iso('2026-11-23T01:00:00.000Z'); // 上海 9:00 整
    const next = nextCronTimeInZone(parseCron('0 9 * * *'), from, 'Asia/Shanghai');
    expect(next.toISOString()).toBe('2026-11-24T01:00:00.000Z');
  });

  it('非法时区与 5 年无解抛 CronError', () => {
    expect(() =>
      nextCronTimeInZone(parseCron('0 9 * * *'), new Date(), 'Mars/Olympus'),
    ).toThrow(CronError);
    expect(() =>
      nextCronTimeInZone(parseCron('0 0 30 2 *'), iso('2026-01-01T00:00:00.000Z'), 'UTC'),
    ).toThrow(CronError);
  });
});
