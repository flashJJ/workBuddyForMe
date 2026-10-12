import { describe, expect, it } from 'vitest';
import {
  EMOTION_EVENT_DELTAS,
  MOOD_DECAY_FACTOR_PER_MINUTE,
  RECENT_EMOTION_EVENTS_LIMIT,
} from '@wbfm/shared/constants';
import {
  createDefaultEmotionState,
  type EmotionState,
} from '@wbfm/shared/schemas';
import {
  applyEmotionEvent,
  createEmotionEvent,
  decayEmotionState,
  normalizeEmotionState,
  recordEmotion,
} from './emotion-kernel';

const T0 = Date.UTC(2026, 9, 12, 8, 0, 0);
const MINUTE = 60_000;

describe('normalizeEmotionState', () => {
  it('null/坏输入回落默认状态', () => {
    const state = normalizeEmotionState(null, T0);
    expect(state).toEqual(createDefaultEmotionState(T0));
    expect(normalizeEmotionState('x', T0).relation.intimacy).toBe(20);
    expect(normalizeEmotionState([], T0).mood.happiness).toBe(10);
  });

  it('越界值被夹回、非数值回落默认', () => {
    const state = normalizeEmotionState(
      {
        mood: { happiness: 999, anger: -5, sadness: 'x' },
        relation: { intimacy: 200, trust: null },
        updatedAt: -1,
      },
      T0,
    );
    expect(state.mood).toEqual({ happiness: 100, anger: 0, sadness: 0 });
    expect(state.relation).toEqual({ intimacy: 100, trust: 30 });
    expect(state.updatedAt).toBe(T0);
  });

  it('非法 need 回落 none；非数值 counters 被过滤', () => {
    const state = normalizeEmotionState(
      { currentNeed: 'sleep', counters: { a: 1, b: 'x', c: -3 } },
      T0,
    );
    expect(state.currentNeed).toBe('none');
    expect(state.counters).toEqual({ a: 1, c: -3 });
  });

  it('坏事件被过滤，合法事件保留并截断到上限', () => {
    const state = normalizeEmotionState(
      {
        recentEvents: [
          null,
          { type: 'praise', source: 'model', timestamp: T0 },
          { type: 'hug', source: 'model', timestamp: T0 },
          { type: 'chat', source: 'cloud', timestamp: T0 },
        ],
      },
      T0,
    );
    expect(state.recentEvents).toHaveLength(1);
    expect(state.recentEvents[0]?.type).toBe('praise');
    expect(state.recentEvents[0]?.id).toBeTruthy();
  });

  it(`recentEvents 最多 ${RECENT_EMOTION_EVENTS_LIMIT} 条（保留最新）`, () => {
    const events = Array.from({ length: RECENT_EMOTION_EVENTS_LIMIT + 3 }, (_, i) => ({
      id: `e${i}`,
      type: 'chat' as const,
      source: 'model' as const,
      timestamp: T0 + i,
    }));
    const state = normalizeEmotionState({ recentEvents: events }, T0);
    expect(state.recentEvents).toHaveLength(RECENT_EMOTION_EVENTS_LIMIT);
    expect(state.recentEvents[0]?.id).toBe('e3');
  });
});

describe('createEmotionEvent', () => {
  it('默认时间戳与 id；description 去空白并截断 240', () => {
    const event = createEmotionEvent({ type: 'praise', source: 'rule', description: '  好棒 ' });
    expect(event.type).toBe('praise');
    expect(event.source).toBe('rule');
    expect(event.description).toBe('好棒');
    expect(event.id).toBeTruthy();
    expect(event.timestamp).toBeGreaterThan(0);

    const long = createEmotionEvent({
      type: 'chat',
      source: 'model',
      timestamp: T0,
      description: 'x'.repeat(300),
    });
    expect(long.description).toHaveLength(240);
  });
});

describe('applyEmotionEvent', () => {
  it('praise/chat/belittle 按增量表更新且夹值域', () => {
    const base = createDefaultEmotionState(T0);
    const praised = applyEmotionEvent(
      base,
      createEmotionEvent({ type: 'praise', source: 'model', timestamp: T0 }),
    );
    expect(praised.mood.happiness).toBe(10 + EMOTION_EVENT_DELTAS.praise.happiness);
    expect(praised.relation.intimacy).toBe(22);
    expect(praised.relation.trust).toBe(31);

    const chatted = applyEmotionEvent(
      base,
      createEmotionEvent({ type: 'chat', source: 'model', timestamp: T0 }),
    );
    expect(chatted.mood.happiness).toBe(10);
    expect(chatted.relation.intimacy).toBe(20.25);

    const belittled = applyEmotionEvent(
      base,
      createEmotionEvent({ type: 'belittle', source: 'rule', timestamp: T0 }),
    );
    expect(belittled.mood).toEqual({ happiness: 4, anger: 8, sadness: 3 });
    expect(belittled.relation).toEqual({ intimacy: 19, trust: 28 });
  });

  it('增量不会突破值域（连续 belittle 夹在 0/100）', () => {
    let state: EmotionState = createDefaultEmotionState(T0);
    for (let i = 0; i < 30; i++) {
      state = applyEmotionEvent(
        state,
        createEmotionEvent({ type: 'belittle', source: 'rule', timestamp: T0 + i }),
      );
    }
    expect(state.mood.happiness).toBeGreaterThanOrEqual(-100);
    expect(state.mood.anger).toBeLessThanOrEqual(100);
    expect(state.relation.intimacy).toBeGreaterThanOrEqual(0);
  });

  it('登记最近事件、updatedAt 取事件时刻', () => {
    const state = applyEmotionEvent(
      createDefaultEmotionState(T0),
      createEmotionEvent({ type: 'praise', source: 'model', timestamp: T0 + 5000 }),
    );
    expect(state.recentEvents).toHaveLength(1);
    expect(state.updatedAt).toBe(T0 + 5000);
  });

  it('输入脏状态先归一化再演算，不抛错', () => {
    const state = applyEmotionEvent(
      { mood: { happiness: 'bad' }, recentEvents: 'no' } as unknown as EmotionState,
      createEmotionEvent({ type: 'chat', source: 'model', timestamp: T0 }),
    );
    expect(state.relation.intimacy).toBe(20.25);
    expect(state.recentEvents).toHaveLength(1);
  });
});

describe('decayEmotionState', () => {
  it('非正/非有限时长返回等价状态（不衰减）', () => {
    const state = applyEmotionEvent(
      createDefaultEmotionState(T0),
      createEmotionEvent({ type: 'praise', source: 'model', timestamp: T0 }),
    );
    const same = decayEmotionState(state, 0, T0);
    expect(same.mood).toEqual(state.mood);
    const bad = decayEmotionState(state, Number.NaN, T0);
    expect(bad.mood).toEqual(state.mood);
  });

  it('按分钟指数衰减：生气最快、开心其次、难过最慢；关系不衰减', () => {
    const state: EmotionState = {
      ...createDefaultEmotionState(T0),
      mood: { happiness: 50, anger: 50, sadness: 50 },
      relation: { intimacy: 80, trust: 80 },
      updatedAt: T0,
    };
    const decayed = decayEmotionState(state, MINUTE, T0 + MINUTE);
    expect(decayed.mood.happiness).toBeCloseTo(
      50 * MOOD_DECAY_FACTOR_PER_MINUTE.happiness,
      3,
    );
    expect(decayed.mood.anger).toBeCloseTo(50 * MOOD_DECAY_FACTOR_PER_MINUTE.anger, 3);
    expect(decayed.mood.sadness).toBeCloseTo(
      50 * MOOD_DECAY_FACTOR_PER_MINUTE.sadness,
      3,
    );
    expect(decayed.mood.anger).toBeLessThan(decayed.mood.happiness);
    expect(decayed.mood.happiness).toBeLessThan(decayed.mood.sadness);
    expect(decayed.relation).toEqual({ intimacy: 80, trust: 80 });
    expect(decayed.updatedAt).toBe(T0 + MINUTE);
  });

  it('长期衰减后情绪趋近于 0 但不反转', () => {
    const state: EmotionState = {
      ...createDefaultEmotionState(T0),
      mood: { happiness: 50, anger: 50, sadness: 50 },
      updatedAt: T0,
    };
    const year = 365 * 24 * 60 * MINUTE;
    const decayed = decayEmotionState(state, year, T0 + year);
    expect(decayed.mood.happiness).toBeGreaterThanOrEqual(0);
    expect(decayed.mood.anger).toBeGreaterThanOrEqual(0);
    expect(decayed.mood.sadness).toBeGreaterThanOrEqual(0);
    expect(decayed.mood.happiness).toBeLessThan(1);
  });
});

describe('recordEmotion 便捷封装', () => {
  it('构造事件并施加', () => {
    const state = recordEmotion(createDefaultEmotionState(T0), {
      type: 'praise',
      source: 'manual',
      timestamp: T0,
    });
    expect(state.mood.happiness).toBe(18);
    expect(state.recentEvents[0]?.source).toBe('manual');
  });
});
