import { describe, expect, it } from 'vitest';
import {
  meetsLevelGate,
  moodFallbackOrder,
  motionMoodOf,
  pickMotionCandidate,
  type MotionSelectionCandidate,
} from './motion-selection';

const candidate = (
  mood: MotionSelectionCandidate['mood'],
  minRelationshipLevel: number | null = null,
  tag: string = mood,
): MotionSelectionCandidate & { tag: string } => ({ mood, minRelationshipLevel, tag });

describe('moodFallbackOrder（VPet FindGraph 兼容顺序）', () => {
  it('精确 → 更差档位 → 更好档位', () => {
    expect(moodFallbackOrder('good')).toEqual(['good', 'normal', 'low']);
    expect(moodFallbackOrder('normal')).toEqual(['normal', 'low', 'good']);
    expect(moodFallbackOrder('low')).toEqual(['low', 'normal', 'good']);
  });
});

describe('meetsLevelGate', () => {
  it('null 门槛恒放行；数值门槛按 >= 判定', () => {
    expect(meetsLevelGate(candidate('normal', null), 0)).toBe(true);
    expect(meetsLevelGate(candidate('normal', 2), 1)).toBe(false);
    expect(meetsLevelGate(candidate('normal', 2), 2)).toBe(true);
  });
});

describe('pickMotionCandidate', () => {
  it('精确档位命中时优先于其它档位', () => {
    const picked = pickMotionCandidate(
      [candidate('low', null, 'low'), candidate('good', null, 'good')],
      { mood: 'good', relationshipLevel: 0 },
    );
    expect(picked?.tag).toBe('good');
  });

  it('缺精确档位时向下兼容（更差档位）', () => {
    const picked = pickMotionCandidate(
      [candidate('low', null, 'low'), candidate('normal', null, 'normal')],
      { mood: 'good', relationshipLevel: 0 },
    );
    expect(picked?.tag).toBe('normal');
  });

  it('正常档缺档时先向下（low）再向上（good）', () => {
    const picked = pickMotionCandidate(
      [candidate('good', null, 'good'), candidate('low', null, 'low')],
      { mood: 'normal', relationshipLevel: 0 },
    );
    expect(picked?.tag).toBe('low');
  });

  it('关系门槛过滤：不够等级的候选被跳过，退到满足门槛的档位', () => {
    const picked = pickMotionCandidate(
      [candidate('good', 2, 'flirty'), candidate('normal', null, 'safe')],
      { mood: 'good', relationshipLevel: 0 },
    );
    expect(picked?.tag).toBe('safe');
  });

  it('全部被关系门槛挡住时返回 null（调用方回落内置 Default）', () => {
    const picked = pickMotionCandidate(
      [candidate('good', 3, 'intimate'), candidate('normal', 2, 'partner')],
      { mood: 'normal', relationshipLevel: 0 },
    );
    expect(picked).toBeNull();
  });

  it('空候选返回 null', () => {
    expect(pickMotionCandidate([], { mood: 'normal', relationshipLevel: 0 })).toBeNull();
  });
});

describe('motionMoodOf（情绪状态 → 动作档位）', () => {
  it('明显正向且无负面 → good', () => {
    expect(motionMoodOf({ happiness: 60, anger: 0, sadness: 0 })).toBe('good');
    expect(motionMoodOf({ happiness: 40, anger: 0, sadness: 0 })).toBe('good');
  });

  it('happiness 为负 → low', () => {
    expect(motionMoodOf({ happiness: -1, anger: 0, sadness: 0 })).toBe('low');
    expect(motionMoodOf({ happiness: -60, anger: 0, sadness: 0 })).toBe('low');
  });

  it('anger/sadness 达到明显阈值 → low（覆盖正向 happiness）', () => {
    expect(motionMoodOf({ happiness: 50, anger: 45, sadness: 0 })).toBe('low');
    expect(motionMoodOf({ happiness: 50, anger: 0, sadness: 45 })).toBe('low');
  });

  it('轻微正向 / 中性 / 低度负面 → normal', () => {
    expect(motionMoodOf({ happiness: 20, anger: 0, sadness: 0 })).toBe('normal');
    expect(motionMoodOf({ happiness: 0, anger: 0, sadness: 0 })).toBe('normal');
    expect(motionMoodOf({ happiness: 55, anger: 20, sadness: 0 })).toBe('normal');
  });
});
