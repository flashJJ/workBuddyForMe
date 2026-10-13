import { describe, expect, it } from 'vitest';
import {
  COMFORT_AFTER_BELITTLE_MS,
  isMorningHour,
  isNightHour,
  resolveSoulEventIntent,
  resolveUserMessageIntents,
} from './trigger-rules';

const NOW = new Date(2026, 9, 13, 22, 30).getTime();

describe('时段判定', () => {
  it('早安 [5,11)', () => {
    expect(isMorningHour(4)).toBe(false);
    expect(isMorningHour(5)).toBe(true);
    expect(isMorningHour(10)).toBe(true);
    expect(isMorningHour(11)).toBe(false);
  });
  it('晚安跨夜 22..4', () => {
    expect(isNightHour(21)).toBe(false);
    expect(isNightHour(22)).toBe(true);
    expect(isNightHour(0)).toBe(true);
    expect(isNightHour(4)).toBe(true);
    expect(isNightHour(5)).toBe(false);
  });
});

describe('resolveUserMessageIntents', () => {
  it('当日首条 + 早安时段 → 早安', () => {
    const intents = resolveUserMessageIntents({
      text: '早',
      hour: 8,
      interactionsTodayBefore: 0,
      lastBelittleAt: null,
      now: NOW,
    });
    expect(intents).toEqual(['firstDailyInteraction']);
  });

  it('非首条/非早安时段不触发早安', () => {
    const intents = resolveUserMessageIntents({
      text: '早',
      hour: 8,
      interactionsTodayBefore: 3,
      lastBelittleAt: null,
      now: NOW,
    });
    expect(intents).toEqual([]);
  });

  it('深夜 + 晚安关键词 → 晚安；白天说晚安不触发', () => {
    const night = resolveUserMessageIntents({
      text: '我先睡了，晚安',
      hour: 23,
      interactionsTodayBefore: 5,
      lastBelittleAt: null,
      now: NOW,
    });
    expect(night).toContain('goodnight');
    const day = resolveUserMessageIntents({
      text: '晚安',
      hour: 12,
      interactionsTodayBefore: 5,
      lastBelittleAt: null,
      now: NOW,
    });
    expect(day).not.toContain('goodnight');
  });

  it('belittle 30min 窗口内 + 安慰短语 → 安慰；超窗/无短语不触发', () => {
    const within = resolveUserMessageIntents({
      text: '别生气了嘛，对不起',
      hour: 20,
      interactionsTodayBefore: 9,
      lastBelittleAt: NOW - 60_000,
      now: NOW,
    });
    expect(within).toContain('comfortAfterBelittle');

    const expired = resolveUserMessageIntents({
      text: '别生气',
      hour: 20,
      interactionsTodayBefore: 9,
      lastBelittleAt: NOW - COMFORT_AFTER_BELITTLE_MS - 1,
      now: NOW,
    });
    expect(expired).not.toContain('comfortAfterBelittle');

    const wrongText = resolveUserMessageIntents({
      text: '今天天气不错',
      hour: 20,
      interactionsTodayBefore: 9,
      lastBelittleAt: NOW - 60_000,
      now: NOW,
    });
    expect(wrongText).toEqual([]);
  });
});

describe('resolveSoulEventIntent', () => {
  it('praise/belittle 映射，chat/undefined 为 null', () => {
    expect(resolveSoulEventIntent('praise')).toBe('praise');
    expect(resolveSoulEventIntent('belittle')).toBe('belittle');
    expect(resolveSoulEventIntent('chat')).toBeNull();
    expect(resolveSoulEventIntent(undefined)).toBeNull();
  });
});
