import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeToolCall } from '../../tools/tool-executor';
import type { CachedWebPage, ToolContext } from '../../tools/types';
import { readFetchedTool } from './read-fetched-tool';

function cachedPage(text: string): CachedWebPage {
  return {
    url: 'https://a.com/doc',
    title: '示例文档',
    text,
    outline: ['第一章', '  小节'],
    truncated: false,
    fetchedAt: Date.now(),
  };
}

const ctx: ToolContext = { knowledgeBaseIds: [], retrieve: async () => [] };

describe('read_fetched：分层抓取续读', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('从回合缓存按 offset 读取，不发起网络请求', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const text = '0123456789'.repeat(100);
    const result = await executeToolCall(
      readFetchedTool,
      { url: 'https://a.com/doc', offset: 500, maxChars: 200 },
      { ...ctx, webCache: new Map([['https://a.com/doc', cachedPage(text)]]) },
    );

    expect(result.ok).toBe(true);
    expect(result.output).toContain('当前 500–700');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('未抓取的 URL 返回可纠正错误', async () => {
    const result = await executeToolCall(
      readFetchedTool,
      { url: 'https://b.com/x' },
      { ...ctx, webCache: new Map() },
    );
    expect(result.ok).toBe(false);
    expect(result.output).toContain('请先调用 fetch_webpage');
  });

  it('没有回合缓存能力时明确不可用', async () => {
    const result = await executeToolCall(readFetchedTool, { url: 'https://a.com/doc' }, ctx);
    expect(result.ok).toBe(false);
    expect(result.output).toContain('read_fetched 不可用');
  });
});
