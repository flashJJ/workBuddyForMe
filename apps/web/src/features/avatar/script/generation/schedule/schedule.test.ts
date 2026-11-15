import { describe, expect, it } from 'vitest';
import { PET_SCRIPT_SCHEDULE_LIMITS } from '@wbfm/shared/schemas';
import {
  isQuietHour,
  isScheduleDue,
  markScheduleRun,
  quietHoursFrom,
  resolveScheduleState,
  scheduleSummary,
  setScheduleEnabled,
  setSchedulePerDay,
} from './schedule';

const at = (hour: number, minute = 0): Date => new Date(2026, 10, 13, hour, minute);

describe('每日自动生成调度（P8.5/P8.6 间隔机制）', () => {
  it('默认关闭、每日 5 次；跨天保留开关与次数并清零今日进度', () => {
    expect(resolveScheduleState(null, '2026-11-13')).toEqual({
      date: '2026-11-13',
      enabled: false,
      perDay: 5,
      runsToday: 0,
      lastRunAt: null,
    });

    const nextDay = resolveScheduleState(
      { date: '2026-11-12', enabled: true, perDay: 3, runsToday: 2, lastRunAt: 1 },
      '2026-11-13',
    );
    expect(nextDay).toMatchObject({ enabled: true, perDay: 3, runsToday: 0, lastRunAt: null });

    expect(resolveScheduleState({ perDay: 99 }, 'd').perDay).toBe(
      PET_SCRIPT_SCHEDULE_LIMITS.maxPerDay,
    );
    expect(resolveScheduleState({ perDay: -3 }, 'd').perDay).toBe(
      PET_SCRIPT_SCHEDULE_LIMITS.minPerDay,
    );
  });

  it('首次检查立即到期，之后两次之间至少间隔 30 分钟', () => {
    const enabled = setScheduleEnabled(resolveScheduleState(null, 'd'), true);
    expect(scheduleSummary(enabled)).toEqual({ enabled: true, perDay: 5, runsToday: 0 });
    expect(isScheduleDue(enabled, at(8, 59))).toBe(true);

    const ran = markScheduleRun(enabled, at(9));
    expect(isScheduleDue(ran, at(9, 29))).toBe(false);
    expect(isScheduleDue(ran, at(9, 30))).toBe(true);
  });

  it('达到每日次数后当天不再触发', () => {
    let state = setScheduleEnabled(resolveScheduleState(null, 'd'), true);
    for (let index = 0; index < 5; index += 1) {
      expect(isScheduleDue(state, at(10, index * 40))).toBe(true);
      state = markScheduleRun(state, at(10, index * 40));
    }
    expect(state.runsToday).toBe(5);
    expect(isScheduleDue(state, at(23, 59))).toBe(false);
  });

  it('次数可配置：调到 2 时当天最多 2 次；调到 0 不再触发', () => {
    const two = setSchedulePerDay(
      setScheduleEnabled(resolveScheduleState(null, 'd'), true),
      2,
    );
    expect(two.perDay).toBe(2);
    expect(isScheduleDue(two, at(9))).toBe(true);
    const once = markScheduleRun(two, at(9));
    expect(isScheduleDue(once, at(9, 30))).toBe(true);
    const twice = markScheduleRun(once, at(9, 30));
    expect(isScheduleDue(twice, at(23))).toBe(false);

    const zero = setSchedulePerDay(two, 0);
    expect(zero.perDay).toBe(0);
    expect(isScheduleDue(zero, at(23))).toBe(false);
  });

  it('关闭后永不到期；重新开启时沿用上次运行时间', () => {
    const disabled = resolveScheduleState({ enabled: false }, 'd');
    expect(isScheduleDue(disabled, at(20))).toBe(false);

    const enabled = setScheduleEnabled(disabled, true);
    expect(isScheduleDue(enabled, at(20))).toBe(true);
    const ran = markScheduleRun(enabled, at(20));
    expect(isScheduleDue(ran, at(20, 29))).toBe(false);
    expect(isScheduleDue(ran, at(20, 30))).toBe(true);
  });

  it('勿扰时段判定：支持跨午夜、关闭与同起止', () => {
    const night = { enabled: true, startHour: 23, endHour: 6 };
    expect(isQuietHour(22, night)).toBe(false);
    expect(isQuietHour(23, night)).toBe(true);
    expect(isQuietHour(5, night)).toBe(true);
    expect(isQuietHour(6, night)).toBe(false);
    expect(isQuietHour(12, { enabled: false, startHour: 23, endHour: 6 })).toBe(false);
    expect(isQuietHour(12, { enabled: true, startHour: 9, endHour: 18 })).toBe(true);
    expect(isQuietHour(8, { enabled: true, startHour: 9, endHour: 18 })).toBe(false);
    expect(isQuietHour(9, { enabled: true, startHour: 9, endHour: 9 })).toBe(false);
    expect(isQuietHour(3, null)).toBe(false);
  });

  it('从设置读取勿扰：默认开启 23–6，显式关闭生效', () => {
    expect(quietHoursFrom({})).toEqual({ enabled: true, startHour: 23, endHour: 6 });
    expect(
      quietHoursFrom({
        doNotDisturbEnabled: false,
        doNotDisturbStartHour: 1,
        doNotDisturbEndHour: 7,
      }),
    ).toEqual({ enabled: false, startHour: 1, endHour: 7 });
  });
});
