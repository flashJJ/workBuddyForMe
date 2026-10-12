import { describe, expect, it } from 'vitest';
import { DEFAULT_EMOTION_INTENSITY, MIN_EXPRESSION_WEIGHT } from '../constants/emotion';
import { createDefaultEmotionState, emotionSignalSchema } from './emotion';
import { baselineExpression, fuseExpression } from './emotion-expression';

const NOW = 1_700_000_000_000;

function stateWith(mood: { happiness?: number; anger?: number; sadness?: number }) {
  const state = createDefaultEmotionState(NOW);
  state.mood = {
    happiness: mood.happiness ?? 10,
    anger: mood.anger ?? 0,
    sadness: mood.sadness ?? 0,
  };
  return state;
}

function signal(
  emotion: string,
  intensity = 0.6,
  soulEvent: 'praise' | 'chat' | 'belittle' = 'chat',
) {
  return emotionSignalSchema.parse({ emotion, intensity, soulEvent });
}

describe('baselineExpression', () => {
  it('默认状态平静', () => {
    expect(baselineExpression(createDefaultEmotionState(NOW))).toBe('neutral');
  });
  it('负向优先：anger 与 sadness 同时高时取 anger', () => {
    expect(baselineExpression(stateWith({ anger: 50, sadness: 60 }))).toBe('anger');
  });
  it('sadness 高（无 anger）→ sadness；happiness 深跌 → sadness', () => {
    expect(baselineExpression(stateWith({ sadness: 40 }))).toBe('sadness');
    expect(baselineExpression(stateWith({ happiness: -40 }))).toBe('sadness');
  });
  it('高开心 → joy', () => {
    expect(baselineExpression(stateWith({ happiness: 55 }))).toBe('joy');
  });
  it('轻微情绪不到阈值 → neutral', () => {
    expect(baselineExpression(stateWith({ happiness: 30, anger: 20 }))).toBe('neutral');
  });
});

describe('fuseExpression', () => {
  it('本轮显式情绪压过基线，权重抬到地板', () => {
    const fused = fuseExpression(stateWith({ anger: 80 }), signal('joy', 0.2), MIN_EXPRESSION_WEIGHT);
    expect(fused.expression).toBe('joy');
    expect(fused.weight).toBe(MIN_EXPRESSION_WEIGHT);
  });

  it('本轮 neutral 时读基线', () => {
    expect(
      fuseExpression(stateWith({ sadness: 70 }), signal('neutral'), MIN_EXPRESSION_WEIGHT)
        .expression,
    ).toBe('sadness');
  });

  it('权重夹在 [地板, 1]（信号解析层已对越界值回落，融合再做防御性夹取）', () => {
    expect(fuseExpression(stateWith({}), signal('joy', 0.99), MIN_EXPRESSION_WEIGHT).weight).toBe(
      0.99,
    );
    expect(fuseExpression(stateWith({}), signal('joy', 0), MIN_EXPRESSION_WEIGHT).weight).toBe(
      MIN_EXPRESSION_WEIGHT,
    );
    // 越界强度在信号解析时回落为默认 0.6
    expect(fuseExpression(stateWith({}), signal('joy', 2), MIN_EXPRESSION_WEIGHT).weight).toBe(
      DEFAULT_EMOTION_INTENSITY,
    );
  });
});
