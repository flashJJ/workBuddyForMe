import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@wbfm/ai';
import { shrinkMessagesForOverflow } from './shrink-messages';

function round(tag: string): ChatMessage[] {
  return [
    { role: 'user', content: `问题 ${tag}` },
    {
      role: 'assistant',
      content: null,
      toolCalls: [{ id: `call-${tag}`, type: 'function', function: { name: 'web_search', arguments: '{}' } }],
    },
    { role: 'tool', content: `结果 ${tag}`, toolCallId: `call-${tag}`, name: 'web_search' },
  ];
}

describe('shrinkMessagesForOverflow：溢出重试缩上下文', () => {
  it('保留 system 与最近的 user 边界，不拆散工具调用配对', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'sys' },
      ...round('a'),
      ...round('b'),
      ...round('c'),
      ...round('d'),
    ];
    const shrunk = shrinkMessagesForOverflow(messages);
    expect(shrunk).not.toBeNull();
    expect(shrunk![0]).toMatchObject({ role: 'system' });
    expect(shrunk![1]!.role).toBe('user');
    expect(shrunk!.length).toBeLessThan(messages.length);
    // 保留段内 assistant tool_calls 与 tool 结果仍成对出现
    const roles = shrunk!.map((message) => message.role);
    expect(roles.indexOf('tool')).toBeGreaterThan(roles.indexOf('assistant'));
  });

  it('消息过少时不缩', () => {
    expect(shrinkMessagesForOverflow([{ role: 'user', content: 'hi' }])).toBeNull();
  });
});
