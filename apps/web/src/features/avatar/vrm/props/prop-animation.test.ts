import { describe, expect, it } from 'vitest';
import { PROP_ANIMATION_MS, samplePropAnimation } from './prop-animation';

describe('道具自身动画采样（S5）', () => {
  it('pour：半周期倾倒到最大，首尾回正', () => {
    expect(samplePropAnimation('pour', 0).rootZ).toBe(0);
    expect(samplePropAnimation('pour', PROP_ANIMATION_MS / 2).rootZ).toBeGreaterThan(0.5);
    expect(samplePropAnimation('pour', PROP_ANIMATION_MS).rootZ).toBe(0);
    expect(samplePropAnimation('pour', PROP_ANIMATION_MS / 2).streamOpacity).toBeGreaterThan(0.5);
  });

  it('flip：35% 处封面完全打开，循环结束合上', () => {
    expect(samplePropAnimation('flip', 0).coverY).toBeCloseTo(0, 6);
    expect(samplePropAnimation('flip', PROP_ANIMATION_MS * 0.35).coverY).toBeLessThan(-1);
    expect(samplePropAnimation('flip', PROP_ANIMATION_MS).coverY).toBeCloseTo(0, 6);
  });
});
