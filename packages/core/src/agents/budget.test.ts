import { AGENT_BUDGET_DEFAULTS } from '@wbfm/shared/schemas';
import { describe, expect, it } from 'vitest';
import {
  advanceRound,
  consume,
  createBudgetState,
  exceededReason,
  isBudgetWithinBounds,
  shouldStop,
  toUsage,
  totalTokens,
} from './budget';

describe('agents/budget 三重预算纯函数', () => {
  it('初始状态零消耗', () => {
    const s = createBudgetState();
    expect(toUsage(s)).toEqual({
      round: 0,
      steps: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    });
    expect(shouldStop(s)).toBe(false);
    expect(exceededReason(s)).toBeNull();
  });

  it('consume 累计步数与双向 token；负数被夹为 0', () => {
    let s = consume(createBudgetState(), { steps: 3, promptTokens: 100, completionTokens: 50 });
    s = consume(s, { steps: 2, promptTokens: 20, completionTokens: -99 });
    expect(s.steps).toBe(5);
    expect(s.promptTokens).toBe(120);
    expect(s.completionTokens).toBe(50);
    expect(totalTokens(s)).toBe(170);
  });

  it('advanceRound 只推进轮次号，消耗累计不清零', () => {
    let s = consume(createBudgetState(), { steps: 4, promptTokens: 99 });
    s = advanceRound(s);
    expect(s.round).toBe(1);
    expect(s.steps).toBe(4);
    expect(s.promptTokens).toBe(99);
  });

  it('轮次触顶：默认 3 轮，进入第 3 轮序号即停', () => {
    let s = createBudgetState();
    expect(exceededReason(s)).toBeNull();
    s = advanceRound(s); // 1
    s = advanceRound(s); // 2
    expect(shouldStop(s)).toBe(false);
    s = advanceRound(s); // 3（=maxRounds）
    expect(exceededReason(s)).toEqual({ kind: 'rounds', used: 3, limit: 3 });
  });

  it('步数触顶：达到上限即停', () => {
    const s = consume(createBudgetState(), { steps: AGENT_BUDGET_DEFAULTS.maxSteps });
    expect(exceededReason(s)?.kind).toBe('steps');
    const near = consume(createBudgetState(), { steps: AGENT_BUDGET_DEFAULTS.maxSteps - 1 });
    expect(shouldStop(near)).toBe(false);
  });

  it('token 触顶：prompt+completion 合计达上限即停', () => {
    const s = consume(createBudgetState(), {
      promptTokens: AGENT_BUDGET_DEFAULTS.maxTotalTokens - 10,
      completionTokens: 20,
    });
    expect(exceededReason(s)).toMatchObject({ kind: 'tokens', limit: AGENT_BUDGET_DEFAULTS.maxTotalTokens });
  });

  it('触顶检查顺序：轮次优先于步数与 token', () => {
    const s: ReturnType<typeof createBudgetState> = {
      round: 99,
      steps: 99999,
      promptTokens: 99_999_999,
      completionTokens: 0,
    };
    expect(exceededReason(s)?.kind).toBe('rounds');
  });

  it('自定义预算：1 轮配置首轮返工即触顶', () => {
    let s = createBudgetState();
    s = advanceRound(s);
    expect(exceededReason(s, { ...AGENT_BUDGET_DEFAULTS, maxRounds: 1 })?.kind).toBe(
      'rounds',
    );
  });

  it('isBudgetWithinBounds 拒绝越界配置', () => {
    expect(isBudgetWithinBounds(AGENT_BUDGET_DEFAULTS)).toBe(true);
    expect(isBudgetWithinBounds({ ...AGENT_BUDGET_DEFAULTS, maxRounds: 0 })).toBe(false);
    expect(isBudgetWithinBounds({ ...AGENT_BUDGET_DEFAULTS, maxRounds: 6 })).toBe(false);
    expect(isBudgetWithinBounds({ ...AGENT_BUDGET_DEFAULTS, maxSteps: 51 })).toBe(false);
    expect(
      isBudgetWithinBounds({ ...AGENT_BUDGET_DEFAULTS, maxTotalTokens: 999 }),
    ).toBe(false);
    expect(
      isBudgetWithinBounds({ ...AGENT_BUDGET_DEFAULTS, maxTotalTokens: 200_001 }),
    ).toBe(false);
  });
});
