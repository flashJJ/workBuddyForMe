import { describe, expect, it } from 'vitest';
import {
  createToolTurnBudget,
  recordToolBudgetUsage,
  reserveToolBudget,
  resolveToolTurnLimits,
  toolBudgetExceeded,
} from './turn-budget';

describe('resolveToolTurnLimits：窗口与检索深度', () => {
  it('8K 窗口保底可读，1M 窗口按比例放大且受硬顶', () => {
    const small = resolveToolTurnLimits(8_192, 'standard');
    expect(small.toolResultTokens).toBeGreaterThanOrEqual(2_880);
    const large = resolveToolTurnLimits(1_000_000, 'standard');
    expect(large.toolResultTokens).toBeGreaterThan(small.toolResultTokens * 10);
    expect(large.toolResultTokens).toBeLessThanOrEqual(200_000);
  });

  it('档位决定页数、搜索次数与单页输出', () => {
    expect(resolveToolTurnLimits(128_000, 'frugal')).toMatchObject({
      maxFetch: 3,
      maxWebSearch: 2,
      perPageChars: 8_000,
    });
    expect(resolveToolTurnLimits(128_000, 'deep')).toMatchObject({
      maxFetch: 12,
      maxWebSearch: 8,
      perPageChars: 16_000,
    });
  });
});

describe('toolBudgetExceeded：次数与硬保险丝', () => {
  it('搜索与抓取次数超限返回拒绝结果', () => {
    const budget = createToolTurnBudget(128_000, 'frugal');
    budget.webSearch = 2;
    budget.fetch = 3;
    expect(toolBudgetExceeded(budget, 'web_search')?.output).toContain('检索次数已达上限');
    expect(toolBudgetExceeded(budget, 'fetch_webpage')?.output).toContain('抓取次数已达上限');
    expect(toolBudgetExceeded(budget, 'current_time')).toBeNull();
  });

  it('软 token 预算超出不拒绝（交给旧结果压缩），硬保险丝才拒绝', () => {
    const budget = createToolTurnBudget(128_000, 'standard');
    budget.toolTokens = budget.limits.toolResultTokens + 100;
    expect(toolBudgetExceeded(budget, 'fetch_webpage')).toBeNull();
    budget.toolTokens = budget.limits.hardToolResultTokens;
    expect(toolBudgetExceeded(budget, 'fetch_webpage')?.output).toContain('硬上限');
  });
});

describe('reserveToolBudget / recordToolBudgetUsage', () => {
  it('派发前预占次数，结果返回后累计 token', () => {
    const budget = createToolTurnBudget(128_000, 'standard');
    reserveToolBudget(budget, 'fetch_webpage');
    reserveToolBudget(budget, 'web_search');
    expect(budget.fetch).toBe(1);
    expect(budget.webSearch).toBe(1);
    recordToolBudgetUsage(budget, '这是工具输出正文');
    expect(budget.toolTokens).toBeGreaterThan(0);
  });
});
