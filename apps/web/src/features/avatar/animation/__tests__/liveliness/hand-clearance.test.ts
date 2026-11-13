import { describe, expect, it } from 'vitest';
import { clearanceTarget } from '../../liveliness';

describe('手部防穿模阈值（clearanceTarget）', () => {
  it('间距足够时不干预', () => {
    expect(clearanceTarget(0.12, 0.09)).toBe(0);
    expect(clearanceTarget(0.09, 0.09)).toBe(0);
  });

  it('贴在一起时给满干预', () => {
    expect(clearanceTarget(0, 0.09)).toBe(1);
    expect(clearanceTarget(0.02, 0.08)).toBeGreaterThan(0.7);
  });

  it('中间线性过渡', () => {
    expect(clearanceTarget(0.045, 0.09)).toBeCloseTo(0.5, 5);
  });

  it('非法阈值/输入不产生 NaN', () => {
    expect(clearanceTarget(0.01, 0)).toBe(0);
    expect(clearanceTarget(Number.NaN, 0.09)).toBe(0);
  });
});
