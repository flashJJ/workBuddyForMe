import { describe, expect, it } from 'vitest';
import {
  EMPTY_SCHEDULE_DRAFT,
  formatScheduleTime,
  isCommonTimezone,
  isValidIanaTimeZone,
  scheduleLabel,
  timezoneOptionsFor,
} from './schedule-helpers';

describe('schedule helpers（v4.26）', () => {
  it('名称为空时回落到 cron', () => {
    expect(scheduleLabel({ name: '  ', cron: '0 9 * * *' })).toBe('0 9 * * *');
    expect(scheduleLabel({ name: ' 早间 ', cron: '0 9 * * *' })).toBe('早间');
  });

  it('时区选项包含常见 IANA，编辑值不在列表时置顶', () => {
    const options = timezoneOptionsFor('Asia/Shanghai');
    expect(options[0]).toBe('Asia/Shanghai');
    expect(options).toContain('America/New_York');
    expect(options.filter((item) => item === 'Asia/Shanghai')).toHaveLength(1);

    const custom = timezoneOptionsFor('Australia/Sydney');
    expect(custom[0]).toBe('Australia/Sydney');
    expect(custom).toContain('UTC');
  });

  it('常用时区判定与自定义 IANA 校验', () => {
    expect(isCommonTimezone('Asia/Shanghai')).toBe(true);
    expect(isCommonTimezone('Europe/Paris')).toBe(false);
    expect(isValidIanaTimeZone('Europe/Paris')).toBe(true);
    expect(isValidIanaTimeZone('UTC')).toBe(true);
    expect(isValidIanaTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidIanaTimeZone('  ')).toBe(false);
  });

  it('默认草稿与时间展示', () => {
    expect(EMPTY_SCHEDULE_DRAFT).toMatchObject({
      cron: '0 9 * * *',
      timezone: 'Asia/Shanghai',
      enabled: true,
    });
    expect(formatScheduleTime(null)).toBe('—');
    expect(formatScheduleTime('2026-11-24T01:00:00.000Z')).not.toBe('—');
    expect(formatScheduleTime('2026-11-24T01:00:00.000Z', 'Asia/Shanghai')).toContain('9:00');
  });
});
