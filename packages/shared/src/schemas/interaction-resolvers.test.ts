import { describe, expect, it } from 'vitest';
import { RELATIONSHIP_LEVEL_NAMES, relationshipLevelName } from './interaction-resolvers';

describe('relationshipLevelName（展示数值等级 → 门控等级名）', () => {
  it('0–3 一一对应（顺序与 relationshipLevelSchema 一致）', () => {
    expect(RELATIONSHIP_LEVEL_NAMES).toEqual(['stranger', 'acquaintance', 'partner', 'intimate']);
    expect(relationshipLevelName(0)).toBe('stranger');
    expect(relationshipLevelName(1)).toBe('acquaintance');
    expect(relationshipLevelName(2)).toBe('partner');
    expect(relationshipLevelName(3)).toBe('intimate');
  });

  it('越界夹紧、非整数四舍五入、非有限值回落陌生', () => {
    expect(relationshipLevelName(-1)).toBe('stranger');
    expect(relationshipLevelName(99)).toBe('intimate');
    expect(relationshipLevelName(1.6)).toBe('partner');
    expect(relationshipLevelName(Number.NaN)).toBe('stranger');
    expect(relationshipLevelName(Number.POSITIVE_INFINITY)).toBe('stranger');
  });
});
