import { describe, expect, it } from 'vitest';
import {
  EMOTION_EVENT_DELTAS,
  EMOTION_SCHEMA_VERSION,
  MOOD_DECAY_FACTOR_PER_MINUTE,
  RECENT_EMOTION_EVENTS_LIMIT,
} from '../constants/emotion';
import {
  createDefaultEmotionState,
  emotionSignalSchema,
  emotionStateSchema,
  moodLevelOf,
  relationLevelOf,
  type EmotionEvent,
} from './emotion';

const NOW = 1_700_000_000_000;

function makeEvent(overrides: Partial<EmotionEvent> = {}): EmotionEvent {
  return {
    id: 'evt-1',
    type: 'praise',
    source: 'model',
    timestamp: NOW,
    ...overrides,
  };
}

describe('createDefaultEmotionState', () => {
  it('产生符合 schema 的 v1 默认状态', () => {
    const state = createDefaultEmotionState(NOW);
    expect(state.schemaVersion).toBe(EMOTION_SCHEMA_VERSION);
    expect(state.currentNeed).toBe('none');
    expect(state.counters).toEqual({});
    expect(state.recentEvents).toEqual([]);
    expect(emotionStateSchema.safeParse(state).success).toBe(true);
  });
});

describe('emotionStateSchema', () => {
  it('接受边界值', () => {
    const state = createDefaultEmotionState(NOW);
    state.mood = { happiness: -100, anger: 100, sadness: 100 };
    state.relation = { intimacy: 0, trust: 100 };
    expect(emotionStateSchema.safeParse(state).success).toBe(true);
  });

  it('拒绝越界情绪/关系值', () => {
    const state = createDefaultEmotionState(NOW);
    state.mood.happiness = 101;
    expect(emotionStateSchema.safeParse(state).success).toBe(false);
    state.mood.happiness = 10;
    state.relation.intimacy = -0.1;
    expect(emotionStateSchema.safeParse(state).success).toBe(false);
  });

  it('拒绝非法需求/事件来源与时间戳', () => {
    const state = createDefaultEmotionState(NOW);
    expect(
      emotionStateSchema.safeParse({ ...state, currentNeed: 'sleep' }).success,
    ).toBe(false);
    state.recentEvents = [makeEvent({ source: 'cloud' as never })];
    expect(emotionStateSchema.safeParse(state).success).toBe(false);
  });

  it(`recentEvents 上限 ${RECENT_EMOTION_EVENTS_LIMIT} 条`, () => {
    const state = createDefaultEmotionState(NOW);
    state.recentEvents = Array.from({ length: RECENT_EMOTION_EVENTS_LIMIT }, (_, i) =>
      makeEvent({ id: `evt-${i}` }),
    );
    expect(emotionStateSchema.safeParse(state).success).toBe(true);
    state.recentEvents.push(makeEvent({ id: 'overflow' }));
    expect(emotionStateSchema.safeParse(state).success).toBe(false);
  });

  it('counters 只接受数值', () => {
    const state = createDefaultEmotionState(NOW);
    expect(
      emotionStateSchema.safeParse({ ...state, counters: { headTouches: 3 } }).success,
    ).toBe(true);
    expect(
      emotionStateSchema.safeParse({ ...state, counters: { headTouches: 'x' } }).success,
    ).toBe(false);
  });
});

describe('emotionSignalSchema（弱模型容错协议）', () => {
  it('合法信号原样通过', () => {
    const parsed = emotionSignalSchema.parse({
      emotion: 'joy',
      intensity: 0.72,
      soulEvent: 'praise',
    });
    expect(parsed).toEqual({ emotion: 'joy', intensity: 0.72, soulEvent: 'praise' });
  });

  it('空对象给全默认值（neutral/默认强度/chat）', () => {
    expect(emotionSignalSchema.parse({})).toEqual({
      emotion: 'neutral',
      intensity: 0.6,
      soulEvent: 'chat',
    });
  });

  it('词表外/越界/类型错逐叶回落，不整体拒绝', () => {
    expect(
      emotionSignalSchema.parse({ emotion: 'dance', intensity: 9, soulEvent: 'hug' }),
    ).toEqual({ emotion: 'neutral', intensity: 0.6, soulEvent: 'chat' });
    expect(
      emotionSignalSchema.parse({ emotion: 123, intensity: '强', soulEvent: null }),
    ).toEqual({ emotion: 'neutral', intensity: 0.6, soulEvent: 'chat' });
  });

  it('边界强度 0 与 1 合法', () => {
    expect(emotionSignalSchema.parse({ intensity: 0 }).intensity).toBe(0);
    expect(emotionSignalSchema.parse({ intensity: 1 }).intensity).toBe(1);
  });
});

describe('等级分级阈值', () => {
  it('moodLevelOf 双极分级', () => {
    expect(moodLevelOf(-100)).toBe('veryLow');
    expect(moodLevelOf(-40)).toBe('veryLow');
    expect(moodLevelOf(-39)).toBe('low');
    expect(moodLevelOf(-1)).toBe('low');
    expect(moodLevelOf(0)).toBe('none');
    expect(moodLevelOf(14)).toBe('none');
    expect(moodLevelOf(15)).toBe('slight');
    expect(moodLevelOf(40)).toBe('evident');
    expect(moodLevelOf(70)).toBe('strong');
  });

  it('relationLevelOf 分级', () => {
    expect(relationLevelOf(0)).toBe('low');
    expect(relationLevelOf(29)).toBe('low');
    expect(relationLevelOf(30)).toBe('building');
    expect(relationLevelOf(55)).toBe('high');
    expect(relationLevelOf(80)).toBe('veryHigh');
    expect(relationLevelOf(100)).toBe('veryHigh');
  });
});

describe('情绪数值常量 sanity', () => {
  it('衰减因子都在 (0,1) 且难过最慢、生气最快', () => {
    for (const factor of Object.values(MOOD_DECAY_FACTOR_PER_MINUTE)) {
      expect(factor).toBeGreaterThan(0);
      expect(factor).toBeLessThan(1);
    }
    expect(MOOD_DECAY_FACTOR_PER_MINUTE.anger).toBeLessThan(
      MOOD_DECAY_FACTOR_PER_MINUTE.happiness,
    );
    expect(MOOD_DECAY_FACTOR_PER_MINUTE.happiness).toBeLessThan(
      MOOD_DECAY_FACTOR_PER_MINUTE.sadness,
    );
  });

  it('事件增量字段齐全且为有限数', () => {
    for (const delta of Object.values(EMOTION_EVENT_DELTAS)) {
      for (const value of Object.values(delta)) {
        expect(Number.isFinite(value)).toBe(true);
      }
    }
    expect(EMOTION_EVENT_DELTAS.praise.intimacy).toBeGreaterThan(
      EMOTION_EVENT_DELTAS.chat.intimacy,
    );
  });
});
