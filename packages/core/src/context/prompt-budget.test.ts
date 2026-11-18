import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@wbfm/ai';
import { buildSceneSnapshot, fitPromptMessages, truncateTextToTokens } from './prompt-budget';

function userText(text: string): ChatMessage {
  return { role: 'user', content: text };
}

describe('fitPromptMessages（单次提示词预算）', () => {
  it('未超预算时逐字不变，并输出预算统计', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: '你是规划者。' },
      userText('帮我整理今天的会议结论。'),
    ];
    const result = fitPromptMessages(messages, {
      contextWindow: 32768,
      scene: 'collab_plan',
      role: 'planner',
    });
    expect(result.messages.map((message) => message.content)).toEqual(
      messages.map((message) => message.content),
    );
    expect(result.stats.scene).toBe('collab_plan');
    expect(result.stats.role).toBe('planner');
    expect(result.stats.truncated).toBe(false);
    expect(result.stats.promptTokens).toBeLessThanOrEqual(result.stats.budgetTokens);
    expect(result.stats.messageCount).toBe(2);
    expect(result.stats.systemTokens).toBeGreaterThan(0);
    expect((result.stats.systemTokens ?? 0) + (result.stats.inputTokens ?? 0)).toBe(
      result.stats.promptTokens,
    );
  });

  it('空消息列表输出零值统计', () => {
    const result = fitPromptMessages([], { contextWindow: 4096, scene: 'flow_node' });
    expect(result.messages).toEqual([]);
    expect(result.stats.promptTokens).toBe(0);
    expect(result.stats.systemTokens).toBe(0);
    expect(result.stats.inputTokens).toBe(0);
    expect(result.stats.messageCount).toBe(0);
    expect(result.stats.truncated).toBe(false);
  });

  it('超预算时保留头尾并插入省略标记', () => {
    const head = '开头关键指令';
    const tail = '结尾关键结论';
    const long = `${head}${'中间内容'.repeat(4000)}${tail}`;
    const result = fitPromptMessages([userText(long)], {
      contextWindow: 4096,
      scene: 'collab_exec',
      role: 'executor',
    });
    const content = result.messages[0]!.content as string;
    expect(result.stats.truncated).toBe(true);
    expect(result.stats.truncatedMessages).toBe(1);
    expect(content).toContain(head);
    expect(content).toContain(tail);
    expect(content).toContain('上下文已截断');
    expect(result.stats.promptTokens).toBeLessThanOrEqual(result.stats.budgetTokens + 16);
    expect(result.stats.messageCount).toBe(1);
    expect(result.stats.systemTokens).toBe(0);
    expect(result.stats.inputTokens).toBe(result.stats.promptTokens);
  });

  it('system 过大时优先截断 system，保留当前用户问题', () => {
    const hugeSystem = '系统规则'.repeat(3000);
    const result = fitPromptMessages(
      [
        { role: 'system', content: hugeSystem },
        userText('请只回答四个字'),
      ],
      { contextWindow: 1024, scene: 'collab_plan' },
    );
    expect((result.messages[0]!.content as string)).toContain('上下文已截断');
    expect(result.messages[1]!.content).toBe('请只回答四个字');
  });

  it('超限时先丢弃旧消息，末条消息始终保留', () => {
    const result = fitPromptMessages(
      [
        { role: 'system', content: '规则' },
        userText('旧问题'.repeat(2000)),
        userText('最后问题'),
      ],
      { contextWindow: 512, scene: 'task_step' },
    );
    expect(result.messages).toHaveLength(2);
    expect(result.messages[result.messages.length - 1]!.content).toBe('最后问题');
    expect(result.stats.droppedMessages).toBe(1);
    expect(result.stats.truncated).toBe(true);
  });

  it('多模态消息保留图片片段，只截断文本', () => {
    const result = fitPromptMessages(
      [
        {
          role: 'user',
          content: [
            { type: 'text', text: '观察内容'.repeat(4000) },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
          ],
        },
      ],
      { contextWindow: 4096, scene: 'collab_exec' },
    );
    const parts = result.messages[0]!.content as Array<{ type: string; text?: string }>;
    expect(parts.some((part) => part.type === 'image_url')).toBe(true);
    expect(parts.some((part) => part.type === 'text' && part.text?.includes('上下文已截断'))).toBe(
      true,
    );
  });
});

describe('truncateTextToTokens', () => {
  it('预算不足时退化且不超出上限', () => {
    const text = '很长的内容'.repeat(1000);
    const clipped = truncateTextToTokens(text, 32);
    expect(clipped.length).toBeGreaterThan(0);
    expect(clipped.length).toBeLessThan(text.length);
  });
});

describe('buildSceneSnapshot', () => {
  it('只构造统计，不做截断；超预算标记 truncated', () => {
    const stats = buildSceneSnapshot({
      scene: 'task_start',
      contextWindow: 4096,
      promptTokens: 500,
      budgetTokens: 614,
    });
    expect(stats.usableWindow).toBe(3686);
    expect(stats.reserveTokens).toBe(614);
    expect(stats.truncated).toBe(false);
    const over = buildSceneSnapshot({
      scene: 'task_start',
      contextWindow: 4096,
      promptTokens: 700,
      budgetTokens: 614,
    });
    expect(over.truncated).toBe(true);
  });
});
