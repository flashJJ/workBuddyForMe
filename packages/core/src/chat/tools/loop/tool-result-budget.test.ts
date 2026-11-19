import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@wbfm/ai';
import { enforceToolResultBudget, toolMessagesTokens } from './tool-result-budget';

const big = (label: string) => `${label}\n${'这是较长的网页正文内容。'.repeat(800)}`;

function toolMessage(id: string, content: string): ChatMessage {
  return { role: 'tool', content, toolCallId: id, name: 'fetch_webpage' };
}

describe('enforceToolResultBudget：旧工具结果折叠', () => {
  it('超出预算时从最旧开始折叠，最新一条保持完整', () => {
    const newest = big('最新页面');
    const messages: ChatMessage[] = [
      { role: 'system', content: 'sys' },
      toolMessage('1', big('最早页面')),
      toolMessage('2', big('中间页面')),
      toolMessage('3', newest),
    ];
    const before = toolMessagesTokens(messages);
    const folded = enforceToolResultBudget(messages, Math.floor(before / 3));

    expect(folded).toBeGreaterThan(0);
    expect(messages[3]!.content).toBe(newest);
    expect(String(messages[1]!.content)).toContain('已折叠');
    expect(toolMessagesTokens(messages)).toBeLessThan(before);
  });

  it('预算充足时不折叠', () => {
    const messages: ChatMessage[] = [toolMessage('1', big('a')), toolMessage('2', big('b'))];
    const folded = enforceToolResultBudget(messages, toolMessagesTokens(messages));
    expect(folded).toBe(0);
  });

  it('只有一条工具结果时不折叠', () => {
    const messages: ChatMessage[] = [toolMessage('1', big('a'))];
    expect(enforceToolResultBudget(messages, 1)).toBe(0);
  });
});
