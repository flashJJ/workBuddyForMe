import { describe, expect, it } from 'vitest';
import {
  isScheduleDue,
  markScheduleRun,
  resolveScheduleState,
  scheduleSummary,
  setScheduleEnabled,
} from './schedule';

const at = (hour: number, minute = 0): Date => new Date(2026, 10, 13, hour, minute);

describe('每日自动生成调度（P8.5）', () => {
  it('默认关闭；跨天保留开关但清零今日次数', () => {
    expect(resolveScheduleState(null, '2026-11-13')).toEqual({
      date: '2026-11-13',
      enabled: false,
      runsToday: 0,
      lastRunAt: null,
    });

    const nextDay = resolveScheduleState(
      { date: '2026-11-12', enabled: true, runsToday: 2, lastRunAt: 1 },
      '2026-11-13',
    );
    expect(nextDay).toMatchObject({ enabled: true, runsToday: 0, lastRunAt: null });
  });

  it('只在 10/16 点窗口且间隔 ≥4h 时到期', () => {
    const enabled = setScheduleEnabled(resolveScheduleState(null, 'd'), true);
    expect(isScheduleDue(enabled, at(9))).toBe(false);
    expect(isScheduleDue(enabled, at(10))).toBe(true);

    const ran = markScheduleRun(enabled, at(10, 5));
    expect(scheduleSummary(ran)).toEqual({ enabled: true, perDay: 2, runsToday: 1 });
    expect(isScheduleDue(ran, at(11))).toBe(false);
    expect(isScheduleDue(ran, at(16, 1))).toBe(true);

    const twice = markScheduleRun(ran, at(16, 5));
    expect(isScheduleDue(twice, at(20))).toBe(false);
  });

  it('关闭后永不到期；晚上首启只跑一次', () => {
    const disabled = resolveScheduleState({ enabled: false }, 'd');
    expect(isScheduleDue(disabled, at(20))).toBe(false);

    const enabled = setScheduleEnabled(disabled, true);
    expect(isScheduleDue(enabled, at(20))).toBe(true);
    const ran = markScheduleRun(enabled, at(20));
    expect(isScheduleDue(ran, at(20, 30))).toBe(false);
  });
});
