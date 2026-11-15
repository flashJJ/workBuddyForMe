import { describe, expect, it } from 'vitest';
import {
  conditionSchema,
  evaluateCondition,
  type Condition,
  type ConditionContext,
} from './conditions';

function ctx(overrides: Partial<ConditionContext> = {}): ConditionContext {
  return {
    hour: 12,
    relationshipLevel: 'partner',
    mood: 'normal',
    sleeping: false,
    faceAway: false,
    busy: false,
    linesEnabled: true,
    emotionEnabled: true,
    ...overrides,
  };
}

function conditionOf(value: unknown): Condition {
  const result = conditionSchema.safeParse(value);
  if (!result.success) throw new Error(JSON.stringify(result.error.issues));
  return result.data;
}

describe('conditionSchema（条件契约）', () => {
  it('接受条件树与各原子条件', () => {
    expect(
      conditionSchema.safeParse({
        all: [{ level: { min: 'partner' } }, { hour: { from: 23, to: 6 } }],
      }).success,
    ).toBe(true);
    expect(conditionSchema.safeParse({ any: [{ mood: ['good'] }, { flag: 'busy' }] }).success).toBe(
      true,
    );
    expect(conditionSchema.safeParse({ not: { flag: 'sleeping' } }).success).toBe(true);
  });

  it('拒绝空组、越界小时、未知枚举与空 mood', () => {
    expect(conditionSchema.safeParse({ all: [] }).success).toBe(false);
    expect(conditionSchema.safeParse({ any: [] }).success).toBe(false);
    expect(conditionSchema.safeParse({ hour: { from: 24, to: 6 } }).success).toBe(false);
    expect(conditionSchema.safeParse({ hour: { from: -1, to: 6 } }).success).toBe(false);
    expect(conditionSchema.safeParse({ level: { min: 'stranger' } }).success).toBe(false);
    expect(conditionSchema.safeParse({ flag: 'awake' }).success).toBe(false);
    expect(conditionSchema.safeParse({ mood: [] }).success).toBe(false);
    expect(conditionSchema.safeParse({}).success).toBe(false);
  });
});

describe('evaluateCondition（纯函数求值）', () => {
  it('时段支持跨零点（含起、不含止）', () => {
    const condition = conditionOf({ hour: { from: 23, to: 6 } });
    expect(evaluateCondition(condition, ctx({ hour: 23 }))).toBe(true);
    expect(evaluateCondition(condition, ctx({ hour: 3 }))).toBe(true);
    expect(evaluateCondition(condition, ctx({ hour: 5 }))).toBe(true);
    expect(evaluateCondition(condition, ctx({ hour: 6 }))).toBe(false);
    expect(evaluateCondition(condition, ctx({ hour: 12 }))).toBe(false);
  });

  it('起止相同视为空窗口（恒 false）', () => {
    const condition = conditionOf({ hour: { from: 13, to: 13 } });
    expect(evaluateCondition(condition, ctx({ hour: 13 }))).toBe(false);
  });

  it('关系门槛按等级顺序比较', () => {
    const partner = conditionOf({ level: { min: 'partner' } });
    expect(evaluateCondition(partner, ctx({ relationshipLevel: 'stranger' }))).toBe(false);
    expect(evaluateCondition(partner, ctx({ relationshipLevel: 'acquaintance' }))).toBe(false);
    expect(evaluateCondition(partner, ctx({ relationshipLevel: 'partner' }))).toBe(true);
    expect(evaluateCondition(partner, ctx({ relationshipLevel: 'intimate' }))).toBe(true);

    const acquaintance = conditionOf({ level: { min: 'acquaintance' } });
    expect(evaluateCondition(acquaintance, ctx({ relationshipLevel: 'stranger' }))).toBe(false);
    expect(evaluateCondition(acquaintance, ctx({ relationshipLevel: 'acquaintance' }))).toBe(true);
  });

  it('情绪档位取列表命中，状态位读上下文布尔', () => {
    expect(
      evaluateCondition(conditionOf({ mood: ['good', 'normal'] }), ctx({ mood: 'low' })),
    ).toBe(false);
    expect(evaluateCondition(conditionOf({ mood: ['low'] }), ctx({ mood: 'low' }))).toBe(true);
    expect(evaluateCondition(conditionOf({ flag: 'sleeping' }), ctx({ sleeping: true }))).toBe(true);
    expect(evaluateCondition(conditionOf({ flag: 'linesEnabled' }), ctx({ linesEnabled: false }))).toBe(
      false,
    );
  });

  it('all / any / not 组合与嵌套', () => {
    const condition = conditionOf({
      all: [
        { level: { min: 'acquaintance' } },
        { any: [{ flag: 'faceAway' }, { not: { flag: 'busy' } }] },
      ],
    });
    expect(evaluateCondition(condition, ctx({ busy: false }))).toBe(true);
    expect(evaluateCondition(condition, ctx({ busy: true, faceAway: true }))).toBe(true);
    expect(evaluateCondition(condition, ctx({ busy: true, faceAway: false }))).toBe(false);
    expect(
      evaluateCondition(condition, ctx({ busy: false, relationshipLevel: 'stranger' })),
    ).toBe(false);
  });
});
