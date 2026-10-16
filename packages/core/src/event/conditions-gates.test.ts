import { describe, expect, it } from 'vitest';
import { evaluateEventConditions as evaluateAll, evaluateEventCondition as evaluateCondition, isValidConditionPath, readConditionValue } from './conditions';
import { effectiveCooldown, isQuietHour } from './gates';
import type { ConditionContext } from './types';

const ctx: ConditionContext = {
  mood: { happiness: 0.8, anger: 0.2, sadness: -0.4 },
  relation: { intimacy: 30, trust: 12 },
  relationship: { level: 2 },
  personality: { frankness: 0.8, tsundere: 0.2, shy: 0.1, tolerance: 0.6 },
  counters: { touchStreak: 3, reunionTier: 2 },
  time: { hour: 23, lastInteractionMin: 5 },
};

describe('条件白名单 path', () => {
  it('四类固定叶子 + counters slug 合法', () => {
    for (const p of [
      'mood.happiness', 'mood.anger', 'mood.sadness',
      'relation.intimacy', 'relation.trust',
      'relationship.level',
      'personality.frankness', 'personality.tsundere', 'personality.shy', 'personality.tolerance',
      'time.hour', 'time.lastInteractionMin',
      'counters.touchStreak', 'counters.reunion_tier_2',
    ]) {
      expect(isValidConditionPath(p)).toBe(true);
    }
  });

  it('拒绝未知根/越层/坏 slug/危险字符', () => {
    for (const p of [
      'mood', 'mood.x', 'relation.intimacy.sub', 'globals.process',
      'counters.', 'counters.1bad', 'counters.a-b', 'counters.x();rm',
      'personality.nonexistent', 'time.minute',
    ]) {
      expect(isValidConditionPath(p)).toBe(false);
    }
  });

  it('读到数值与缺失回落 null', () => {
    expect(readConditionValue(ctx, 'relation.intimacy')).toBe(30);
    expect(readConditionValue(ctx, 'relationship.level')).toBe(2);
    expect(readConditionValue(ctx, 'counters.missing')).toBeNull();
    expect(readConditionValue(ctx, 'mood.unknown')).toBeNull();
  });
});

describe('条件求值', () => {
  it('五种比较符', () => {
    const c = (op: 'gt' | 'gte' | 'lt' | 'lte' | 'eq', value: number) =>
      evaluateCondition(ctx, { path: 'relation.intimacy', op, value });
    expect(c('gte', 30)).toBe(true);
    expect(c('gt', 30)).toBe(false);
    expect(c('lt', 31)).toBe(true);
    expect(c('lte', 30)).toBe(true);
    expect(c('eq', 30)).toBe(true);
    expect(c('eq', 31)).toBe(false);
  });

  it('未知 path/缺失计数按 false，并回调 onInvalid（仅限非法 path）', () => {
    const invalid: string[] = [];
    expect(evaluateCondition(ctx, { path: 'hack.me', op: 'eq', value: 1 }, (p) => invalid.push(p))).toBe(false);
    expect(invalid).toContain('hack.me');
    // 合法但无数值：false，但不算非法
    expect(evaluateCondition(ctx, { path: 'counters.none', op: 'eq', value: 0 }, (p) => invalid.push(p))).toBe(false);
    expect(invalid).not.toContain('counters.none');
  });

  it('AND 语义；空数组恒真（无条件汇合跳转）', () => {
    expect(evaluateAll(ctx, [
      { path: 'relation.intimacy', op: 'gte', value: 30 },
      { path: 'mood.happiness', op: 'gt', value: 0.5 },
      { path: 'counters.touchStreak', op: 'eq', value: 3 },
    ])).toBe(true);
    expect(evaluateAll(ctx, [{ path: 'relation.intimacy', op: 'gt', value: 99 }])).toBe(false);
    expect(evaluateAll(ctx, [])).toBe(true);
  });
});

describe('勿扰时段', () => {
  it('同区间与跨夜边界', () => {
    expect(isQuietHour(22, 23, 8)).toBe(false);
    expect(isQuietHour(23, 23, 8)).toBe(true);
    expect(isQuietHour(0, 23, 8)).toBe(true);
    expect(isQuietHour(7, 23, 8)).toBe(true);
    expect(isQuietHour(8, 23, 8)).toBe(false);
    expect(isQuietHour(12, 13, 14)).toBe(false);
    expect(isQuietHour(13, 13, 14)).toBe(true);
  });

  it('start=end 全天勿扰；非法小时保守 true', () => {
    expect(isQuietHour(12, 0, 0)).toBe(true);
    expect(isQuietHour(24, 23, 8)).toBe(true);
  });
});

describe('频率档系数', () => {
  it('low 拉长 / standard 不变 / high 缩短', () => {
    expect(effectiveCooldown(1000, 'low')).toBe(1500);
    expect(effectiveCooldown(1000, 'standard')).toBe(1000);
    expect(effectiveCooldown(1000, 'high')).toBe(600);
  });
});
