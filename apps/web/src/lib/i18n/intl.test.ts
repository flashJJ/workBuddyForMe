import { describe, expect, it } from 'vitest';
import {
  formatCompactDateTime,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatTime,
} from './intl';

// 用固定 UTC 时刻 + timeZone 选项，避免本机时区影响断言
const UTC: Intl.DateTimeFormatOptions = { timeZone: 'UTC' };
const MOMENT = '2026-03-07T14:30:05Z';

describe('Intl 本地化格式化（T4.5）', () => {
  it('日期：zh/en 各自习惯（固定 UTC，2-digit 月日补零）', () => {
    expect(formatDate(MOMENT, 'zh-CN', UTC)).toBe('2026/03/07');
    expect(formatDate(MOMENT, 'en-US', UTC)).toBe('03/07/2026');
  });

  it('时间：英文 12 小时制带 AM/PM，中文 24 小时制', () => {
    expect(formatTime(MOMENT, 'en-US', { ...UTC, hour: '2-digit', minute: '2-digit' })).toBe(
      '02:30 PM',
    );
    expect(formatTime(MOMENT, 'zh-CN', { ...UTC, hour: '2-digit', minute: '2-digit' })).toBe(
      '14:30',
    );
  });

  it('完整日期时间：语言切换输出不同格式，zh 不回归', () => {
    expect(formatDateTime(MOMENT, 'zh-CN', UTC)).toBe('2026/03/07 14:30');
    expect(formatDateTime(MOMENT, 'en-US', UTC)).toBe('03/07/2026, 02:30 PM');
  });

  it('紧凑列表时间：月/日 2-digit + 时分（时区随运行环境，只校验形态）', () => {
    for (const locale of ['zh-CN', 'en-US'] as const) {
      expect(formatCompactDateTime(MOMENT, locale)).toMatch(/^\d{2}\/\d{2}.*\d{2}:\d{2}/);
    }
  });

  it('数字千分位随 locale', () => {
    expect(formatNumber(1234567, 'en-US')).toBe('1,234,567');
    expect(formatNumber(0.5, 'en-US', { minimumFractionDigits: 1 })).toBe('0.5');
  });

  it('百分比随 locale', () => {
    expect(formatPercent(0.65, 'en-US')).toBe('65%');
    expect(formatPercent(1, 'zh-CN')).toBe('100%');
  });

  it('非法日期原样返回输入字符串（不抛错）', () => {
    expect(formatDate('not-a-date', 'zh-CN')).toBe('not-a-date');
    expect(formatCompactDateTime('not-a-date', 'en-US')).toBe('');
  });
});
