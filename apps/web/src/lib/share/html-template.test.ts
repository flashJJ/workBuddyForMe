import { describe, expect, it } from 'vitest';
import type { ConversationSnapshot } from '@wbfm/core';
import { renderConversationHtml } from './html-template';

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

describe('renderConversationHtml（M2）', () => {
  it('文档头：title 标签 + 标题 + 助手 + 时间', () => {
    const html = renderConversationHtml(baseSnapshot());
    expect(html).toContain('<title>技术方案讨论</title>');
    expect(html).toContain('<h1>技术方案讨论</h1>');
    expect(html).toContain('助手：通用助手');
    expect(html).toContain('2025-06-01 08:30');
  });

  it('XSS 防护：标题/正文/工具参数均转义', () => {
    const html = renderConversationHtml(
      baseSnapshot({
        title: '<script>alert(1)</script>',
        messages: [
          {
            role: 'user', content: '<img src=x onerror=alert(2)>', createdAt: '', parts: [], citations: [],
            toolTrace: [
              {
                callId: 't', tool: 'fetch_webpage', argsSummary: '<script>alert(3)</script>',
                status: 'error', durationMs: 1, error: '<b>err</b>', resultSummary: '', startedAt: '',
              },
            ],
          },
        ],
      }),
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    // img 标签尖括号被转义，onerror 仅作为无害文本残留
    expect(html).not.toContain('<img src=x onerror=alert(2)>');
    expect(html).toContain('&lt;img src=x onerror=alert(2)&gt;');
    expect(html).toContain('&lt;script&gt;alert(3)&lt;/script&gt;');
    expect(html).toContain('&lt;b&gt;err&lt;/b&gt;');
  });

  it('围栏代码块 → pre>code（lang 类名保留）+ 代码内容转义', () => {
    const html = renderConversationHtml(
      baseSnapshot({
        messages: [
          {
            role: 'assistant', createdAt: '', parts: [], toolTrace: [], citations: [],
            content: '示例：\n\n```ts\nconst a = 1 < 2;\n```',
          },
        ],
      }),
    );
    expect(html).toContain('<pre><code class="lang-ts">const a = 1 &lt; 2;</code></pre>');
  });

  it('行内代码渲染', () => {
    const html = renderConversationHtml(
      baseSnapshot({
        messages: [{ role: 'user', content: '调用 `build()` 即可', createdAt: '', parts: [], toolTrace: [], citations: [] }],
      }),
    );
    expect(html).toContain('<code>build()</code>');
  });

  it('图片 part → <img> data URL', () => {
    const html = renderConversationHtml(
      baseSnapshot({
        messages: [
          {
            role: 'user', content: '', createdAt: '', toolTrace: [], citations: [],
            parts: [{ type: 'image', dataUrl: 'data:image/png;base64,AAAA' }],
          },
        ],
      }),
    );
    expect(html).toContain('<img src="data:image/png;base64,AAAA"');
  });

  it('工具卡片成功/失败样式 class', () => {
    const html = renderConversationHtml(
      baseSnapshot({
        messages: [
          {
            role: 'assistant', content: '', createdAt: '', parts: [], citations: [],
            toolTrace: [
              { callId: '1', tool: 'fetch_webpage', argsSummary: '', status: 'ok', durationMs: 2300, resultSummary: 'ok', startedAt: '' },
              { callId: '2', tool: 'knowledge_search', argsSummary: '', status: 'error', durationMs: 50, error: 'bad', resultSummary: '', startedAt: '' },
            ],
          },
        ],
      }),
    );
    expect(html).toContain('class="tool ok"');
    expect(html).toContain('2.3s → ✅ 成功');
    expect(html).toContain('class="tool error"');
  });

  it('引用角标可点击 + 摘要 details 可展开 + 原文链接', () => {
    const html = renderConversationHtml(
      baseSnapshot({
        messages: [
          {
            role: 'assistant', content: '结论', createdAt: '', parts: [], toolTrace: [],
            citations: [
              { documentId: 'd1', documentName: '架构.md', ordinal: 3, snippet: '模块分层', sourceUrl: 'https://a.com' },
            ],
          },
        ],
      }),
    );
    expect(html).toContain('<sup class="cite"><a href="#cite-1">1</a></sup>');
    expect(html).toContain('<li id="cite-1">');
    expect(html).toContain('<details><summary>查看摘要</summary>模块分层</details>');
    expect(html).toContain('href="https://a.com" target="_blank" rel="noopener noreferrer"');
  });

  it('单文件零外部样式依赖 + 水印', () => {
    const html = renderConversationHtml(baseSnapshot());
    expect(html).not.toContain('<link');
    expect(html).toContain('<style>');
    expect(html).toContain('由 WorkBuddy For Me v0.4.0 生成');
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
  });
});
