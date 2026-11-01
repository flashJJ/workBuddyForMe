import type { WebSearchInput, WebSearchResponse } from '@wbfm/shared/types';
import type { SearchProvider } from './types';

/** v2.17：测试 / 演示用 mock 搜索；不发起网络请求，结果固定可断言 */
export function createMockSearchProvider(): SearchProvider {
  return {
    id: 'mock',
    async search(input: WebSearchInput): Promise<WebSearchResponse> {
      const count = Math.max(1, Math.min(8, input.maxResults ?? 3));
      const results = Array.from({ length: count }, (_, index) => ({
        title: `${input.query} 示例结果 ${index + 1}`,
        url: `https://example.com/search/${encodeURIComponent(input.query)}/${index + 1}`,
        snippet: `这是关于「${input.query}」的示例摘要 ${index + 1}。`,
        source: 'mock',
      }));
      return { provider: 'mock', results };
    },
    async testConnection() {
      return { ok: true, message: 'Mock 搜索可用' };
    },
  };
}
