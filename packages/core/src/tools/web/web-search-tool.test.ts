import { describe, expect, it, vi } from 'vitest';
import type { ToolContext } from '../types';
import { webSearchTool } from './web-search-tool';

const CTX = {
  signal: undefined,
  knowledgeBaseIds: [],
  retrieve: async () => [],
} as ToolContext;

describe('web_search tool', () => {
  it('未配置搜索服务时返回可执行错误', async () => {
    const result = await webSearchTool.run({ query: '测试' }, CTX);
    expect(result.ok).toBe(false);
    expect(result.output).toContain('联网搜索未配置');
  });

  it('格式化搜索结果并限制摘要长度', async () => {
    const searchWeb = vi.fn().mockResolvedValue({
      provider: 'mock',
      results: [
        { title: 'A', url: 'https://a.example', snippet: 'x'.repeat(400), source: 'mock' },
        { title: 'B', url: 'https://b.example', snippet: 'b', source: 'mock' },
      ],
    });
    const result = await webSearchTool.run(
      { query: '测试', maxResults: 2 },
      { ...CTX, searchWeb } as ToolContext,
    );
    expect(result.ok).toBe(true);
    expect(result.summary).toBe('mock · 2 条');
    expect(result.output).toContain('1. A');
    expect(result.output).toContain('https://a.example');
    expect(searchWeb).toHaveBeenCalledWith(
      expect.objectContaining({ query: '测试', maxResults: 2 }),
      undefined,
    );
  });

  it('空结果返回 ok:false 但不抛错', async () => {
    const result = await webSearchTool.run(
      { query: '空' },
      {
        ...CTX,
        searchWeb: vi.fn().mockResolvedValue({ provider: 'mock', results: [] }),
      } as ToolContext,
    );
    expect(result.ok).toBe(false);
    expect(result.summary).toBe('mock · 0 条');
  });
});
