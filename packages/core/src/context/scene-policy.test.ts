import { describe, expect, it } from 'vitest';
import { resolveClampedBudget } from '@wbfm/shared/constants';

describe('resolveClampedBudget（场景预算单一真源）', () => {
  it('4096 窗口按比例收敛，与 v4.7/v4.8.1 数值一致', () => {
    expect(resolveClampedBudget(4096, 'contextBlock')).toBe(614);
    expect(resolveClampedBudget(4096, 'stepHistory')).toBe(491);
  });

  it('32K 与 1M 窗口用满上限', () => {
    expect(resolveClampedBudget(32768, 'contextBlock')).toBe(2000);
    expect(resolveClampedBudget(32768, 'stepHistory')).toBe(1200);
    expect(resolveClampedBudget(1_000_000, 'contextBlock')).toBe(2000);
    expect(resolveClampedBudget(1_000_000, 'stepHistory')).toBe(1200);
  });

  it('极小窗口保留下限，未知窗口用上限兜底', () => {
    expect(resolveClampedBudget(1000, 'contextBlock')).toBe(320);
    expect(resolveClampedBudget(1000, 'stepHistory')).toBe(320);
    expect(resolveClampedBudget(null, 'contextBlock')).toBe(2000);
    expect(resolveClampedBudget(undefined, 'stepHistory')).toBe(1200);
    expect(resolveClampedBudget(0, 'contextBlock')).toBe(2000);
  });
});
