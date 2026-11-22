import { describe, expect, it } from 'vitest';
import { estimateTokens } from '../../chat/context/context-budget';
import { packContext } from './packer';
import type { ContextFragment } from './types';

function fragment(key: string, priority: number, text: string, separator?: string): ContextFragment {
  return { key, priority, text, source: 'conversation-summary', ...(separator ? { separator } : {}) };
}

describe('packContext（排序 / 去重 / 预算）', () => {
  it('按优先级升序拼接，高优先级在前', () => {
    const result = packContext(
      [fragment('memory', 50, '记忆'), fragment('summary', 10, '摘要'), fragment('plan', 30, '计划')],
      { budgetTokens: 2000 },
    );
    expect(result.text).toBe('摘要\n\n计划\n\n记忆');
    expect(result.fragments).toBe(3);
    expect(result.dropped).toBe(0);
    expect(result.truncated).toBe(false);
  });

  it('同 key 只保留优先级更高的一条', () => {
    const result = packContext(
      [fragment('dup', 50, '低优先'), fragment('dup', 10, '高优先')],
      { budgetTokens: 2000 },
    );
    expect(result.text).toBe('高优先');
    expect(result.fragments).toBe(1);
    expect(result.dropped).toBe(1);
  });

  it('超预算时从尾部整段丢弃，保留高优先级片段', () => {
    const big = 'a'.repeat(400); // 100 tokens
    const result = packContext([fragment('summary', 10, big), fragment('memory', 50, big)], {
      budgetTokens: 150,
    });
    expect(result.text).toBe(big);
    expect(result.fragments).toBe(1);
    expect(result.dropped).toBe(1);
    expect(result.truncated).toBe(false);
  });

  it('仅剩一段仍超预算时按 token 截断', () => {
    const result = packContext([fragment('summary', 10, 'a'.repeat(400))], { budgetTokens: 50 });
    expect(result.truncated).toBe(true);
    expect(result.text!.endsWith('…')).toBe(true);
    expect(estimateTokens(result.text!)).toBeLessThanOrEqual(50);
  });

  it('无片段或预算非正时返回 null', () => {
    expect(packContext([], { budgetTokens: 2000 }).text).toBeNull();
    expect(packContext([fragment('summary', 10, '有内容')], { budgetTokens: 0 }).text).toBeNull();
  });

  it('分隔符可由选项或片段覆盖', () => {
    expect(packContext([fragment('a', 10, 'A'), fragment('b', 20, 'B')], {
      budgetTokens: 2000,
      separator: '\n',
    }).text).toBe('A\nB');
    expect(packContext([fragment('a', 10, 'A', ' | '), fragment('b', 20, 'B')], {
      budgetTokens: 2000,
    }).text).toBe('A | B');
  });
});
