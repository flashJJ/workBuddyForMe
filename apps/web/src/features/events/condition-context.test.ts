import { describe, expect, it } from 'vitest';
import { createDefaultEmotionState } from '@wbfm/shared/schemas';
import { buildConditionContext, DEFAULT_PERSONALITY } from './condition-context';

const NOW = new Date(2026, 9, 13, 9, 30).getTime();

describe('buildConditionContext', () => {
  it('情绪态快照 + 临时计数器覆盖同名键 + 本地小时', () => {
    const emotion = createDefaultEmotionState(NOW);
    emotion.mood.happiness = 0.8;
    emotion.relation.intimacy = 42;
    emotion.counters = { keep: 9 };
    const ctx = buildConditionContext({
      emotion,
      now: NOW,
      lastInteractionMin: 3,
      extraCounters: { reunionTier: 2, keep: 1 },
    });
    expect(ctx.mood.happiness).toBe(0.8);
    expect(ctx.relation.intimacy).toBe(42);
    expect(ctx.counters).toEqual({ keep: 1, reunionTier: 2 });
    expect(ctx.time.hour).toBe(9);
    expect(ctx.time.lastInteractionMin).toBe(3);
    expect(ctx.personality).toBe(DEFAULT_PERSONALITY);
  });

  it('emotion=null 给中性快照；自定义 personality 透传；无交互记录给安全大值', () => {
    const ctx = buildConditionContext({
      emotion: null,
      now: NOW,
      lastInteractionMin: null,
      personality: { frankness: 0.8, tsundere: 0.2, shy: 0.1, tolerance: 0.6 },
    });
    expect(ctx.mood).toEqual({ happiness: 0, anger: 0, sadness: 0 });
    expect(ctx.relation).toEqual({ intimacy: 0, trust: 0 });
    expect(ctx.relationship.level).toBe(0);
    expect(ctx.personality.frankness).toBe(0.8);
    expect(ctx.time.lastInteractionMin).toBeGreaterThan(24 * 60 * 365);
  });

  it('v2.0：relationship.level 取展示等级（地板与迟滞同口径）；开关关闭恒 0', () => {
    const emotion = createDefaultEmotionState(NOW);
    emotion.relation = { intimacy: 60, trust: 60 };
    emotion.relationship.levelFloor = 2;
    const on = buildConditionContext({ emotion, now: NOW, lastInteractionMin: null });
    expect(on.relationship.level).toBe(2);
    const off = buildConditionContext({
      emotion,
      now: NOW,
      lastInteractionMin: null,
      relationshipEnabled: false,
    });
    expect(off.relationship.level).toBe(0);
  });
});
