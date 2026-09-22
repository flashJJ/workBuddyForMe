import { describe, expect, it } from 'vitest';
import type { ConversationSnapshot } from '@wbfm/core';
import { serializeMarkdown } from './markdown-serializer';

function baseSnapshot(overrides: Partial<ConversationSnapshot> = {}): ConversationSnapshot {
  return {
    conversationId: 'c1',
    title: '技术方案讨论',
    assistantName: '通用助手',
    exportedAt: '2025-06-01T08:30:00.000Z',
    appVersion: '0.4.0',
    messages: [],
    ...overrides,
  };
}

describe('serializeMarkdown（M2）', () => {
  it('文档头：标题 + 助手 + 导出时间', () => {
    const md = serializeMarkdown(baseSnapshot());
    expect(md).toContain('# 技术方案讨论');
    expect(md).toContain('助手：通用助手');
    expect(md).toContain('导出时间：2025-06-01 08:30');
  });

  it('user/assistant 角色标题 + 正文按序渲染', () => {
    const md = serializeMarkdown(
      baseSnapshot({
        messages: [
          { role: 'user', content: '你好', createdAt: '2025-06-01T08:31:00Z', parts: [], toolTrace: [], citations: [] },
          { role: 'assistant', content: '嗨！', createdAt: '2025-06-01T08:31:05Z', parts: [], toolTrace: [], citations: [] },
        ],
      }),
    );
    expect(md.indexOf('### 🧑 用户')).toBeLessThan(md.indexOf('### 🤖 助手'));
    expect(md).toContain('你好');
    expect(md).toContain('嗨！');
  });

  it('工具成功块：> 🔧 tool (2.3s) → 成功 + 参数/结果', () => {
    const md = serializeMarkdown(
      baseSnapshot({
        messages: [
          {
            role: 'assistant', content: '完成', createdAt: '', parts: [], citations: [],
            toolTrace: [
              {
                callId: 't1', tool: 'fetch_webpage', argsSummary: 'https://a.com',
                status: 'ok', durationMs: 2300, resultSummary: '抓取 1.2KB', startedAt: '',
              },
            ],
          },
        ],
      }),
    );
    expect(md).toContain('> 🔧 **fetch_webpage** (2.3s) → ✅ 成功');
    expect(md).toContain('> 参数：https://a.com');
    expect(md).toContain('> 结果：抓取 1.2KB');
  });

  it('工具失败块渲染错误信息', () => {
    const md = serializeMarkdown(
      baseSnapshot({
        messages: [
          {
            role: 'assistant', content: '', createdAt: '', parts: [], citations: [],
            toolTrace: [
              {
                callId: 't1', tool: 'knowledge_search', argsSummary: 'q',
                status: 'error', durationMs: 120, resultSummary: '', error: '索引不可用', startedAt: '',
              },
            ],
          },
        ],
      }),
    );
    expect(md).toContain('→ ❌ 失败');
    expect(md).toContain('> 错误：索引不可用');
  });

  it('引用角标 → 脚注链接，含文档名/摘要/原文 URL', () => {
    const md = serializeMarkdown(
      baseSnapshot({
        messages: [
          {
            role: 'assistant', content: '答案在此', createdAt: '', parts: [], toolTrace: [],
            citations: [
              { documentId: 'd1', documentName: '架构.md', ordinal: 1, snippet: '模块分层', sourceUrl: 'https://a.com/x' },
            ],
          },
        ],
      }),
    );
    expect(md).toContain('答案在此 [^1]');
    expect(md).toContain('## 引用来源');
    expect(md).toContain('[^1]: **架构.md** — 模块分层 — [原文链接](https://a.com/x)');
  });

  it('相同 documentId+ordinal 的引用复用同一脚注编号', () => {
    const md = serializeMarkdown(
      baseSnapshot({
        messages: [
          {
            role: 'assistant', content: '一', createdAt: '', parts: [], toolTrace: [],
            citations: [{ documentId: 'd1', documentName: '架构.md', ordinal: 0 }],
          },
          {
            role: 'assistant', content: '二', createdAt: '', parts: [], toolTrace: [],
            citations: [{ documentId: 'd1', documentName: '架构.md', ordinal: 0 }],
          },
        ],
      }),
    );
    expect(md).toContain('一 [^1]');
    expect(md).toContain('二 [^1]');
    expect(md.match(/\[\^1\]:/g)).toHaveLength(1);
  });

  it('多模态图片 parts 内联 data URL', () => {
    const md = serializeMarkdown(
      baseSnapshot({
        messages: [
          {
            role: 'user', content: '', createdAt: '', toolTrace: [], citations: [],
            parts: [
              { type: 'text', text: '看这张图' },
              { type: 'image', dataUrl: 'data:image/png;base64,AAAA' },
            ],
          },
        ],
      }),
    );
    expect(md).toContain('看这张图');
    expect(md).toContain('![图片](data:image/png;base64,AAAA)');
  });

  it('空文本消息占位 + 尾部水印版本号', () => {
    const md = serializeMarkdown(
      baseSnapshot({
        messages: [
          { role: 'assistant', content: '', createdAt: '', parts: [], toolTrace: [], citations: [] },
        ],
      }),
    );
    expect(md).toContain('（无文本内容）');
    expect(md.trimEnd().endsWith('*由 WorkBuddy For Me v0.4.0 生成*')).toBe(true);
  });
});
