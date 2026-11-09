import { describe, expect, it } from 'vitest';
import type { Message } from '@wbfm/shared/types';
import {
  READ_ALOUD_CHUNK_MAX,
  latestAssistantSpeech,
  splitSpeechChunks,
  toSpeakableText,
} from './read-aloud-text';

function message(role: Message['role'], content: string): Message {
  return {
    id: `${role}-${content.length}`,
    conversationId: 'c1',
    role,
    content,
    contentParts: [],
    status: 'completed',
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    citations: [],
    toolTrace: [],
    feedback: null,
    feedbackAt: null,
    errorCode: null,
    errorMessage: null,
    createdAt: '2025-01-01T00:00:00.000Z',
  };
}

describe('朗读文本抽取（read-aloud-text）', () => {
  it('去除 Markdown 标记，保留正文与链接文字', () => {
    const text = toSpeakableText(
      [
        '## 标题',
        '',
        '这是**重点**与 `代码`，见 [文档](https://example.com)。',
        '> 引用一行',
        '- 列表项',
        '',
        '```ts',
        'const hidden = true;',
        '```',
      ].join('\n'),
    );
    expect(text).not.toContain('##');
    expect(text).not.toContain('**');
    expect(text).not.toContain('`');
    expect(text).not.toContain('hidden');
    expect(text).toContain('文档');
    expect(text).toContain('引用一行');
    expect(text).toContain('列表项');
  });

  it('取最后一条有正文的助手消息，忽略用户消息', () => {
    const speech = latestAssistantSpeech([
      message('assistant', '旧回复'),
      message('user', '最新提问'),
      message('assistant', '最新回复'),
      message('assistant', '   '),
    ]);
    expect(speech).toBe('最新回复');
  });

  it('没有助手正文时返回 null', () => {
    expect(latestAssistantSpeech([message('user', '你好')])).toBeNull();
  });

  it('按句切块且不超过接口上限，超长单句硬切', () => {
    const chunks = splitSpeechChunks('第一句。第二句！' + '长'.repeat(READ_ALOUD_CHUNK_MAX + 50));
    expect(chunks[0]).toBe('第一句。 第二句！');
    expect(chunks.slice(1).every((chunk) => chunk.length <= READ_ALOUD_CHUNK_MAX)).toBe(true);
    expect(chunks.slice(1).join('').length).toBe(READ_ALOUD_CHUNK_MAX + 50);
  });
});
