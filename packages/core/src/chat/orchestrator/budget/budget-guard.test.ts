import { describe, expect, it } from 'vitest';
import { checkConversationBudget, type BudgetReader } from './budget-guard';

function reader(limit: number | null, used: number): BudgetReader {
  return { tokenBudget: () => limit, usedTokens: () => used };
}

describe('v4.18 会话预算检查', () => {
  it('未设置预算时不提示不拦截', () => {
    expect(checkConversationBudget(reader(null, 999_999), 'c1')).toEqual({});
  });

  it('低于 80% 不提示', () => {
    expect(checkConversationBudget(reader(10_000, 7_999), 'c1')).toEqual({});
  });

  it('达到 80% 给出提示但不拦截', () => {
    expect(checkConversationBudget(reader(10_000, 8_000), 'c1')).toEqual({
      warning: { usedTokens: 8_000, limitTokens: 10_000, ratio: 0.8 },
    });
  });

  it('达到 100% 拦截并给出可读原因', () => {
    const result = checkConversationBudget(reader(10_000, 10_000), 'c1');
    expect(result.warning).toBeUndefined();
    expect(result.exceeded).toMatchObject({ code: 'TOKEN_BUDGET_EXCEEDED' });
    expect(result.exceeded?.message).toContain('10000/10000');
  });
});
