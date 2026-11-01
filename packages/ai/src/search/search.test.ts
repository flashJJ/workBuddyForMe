import { describe, expect, it, vi } from 'vitest';
import { createSearchProvider } from './index';
import { SearchError } from './types';

const SETTINGS = {
  provider: 'searxng' as const,
  endpoint: 'https://search.example',
  maxResults: 5,
  timeoutMs: 5000,
  allowPrivateEndpoint: false,
};

describe('search providers', () => {
  it('SearXNG 映射结果并限制条数', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            { title: 'A', url: 'https://a.example/x', content: 'snippet a', engine: 'google' },
            { title: 'B', url: 'https://b.example/y', content: 'snippet b', engine: 'bing' },
            { title: '', url: 'https://bad.example' },
          ],
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const provider = createSearchProvider(SETTINGS);
    const response = await provider.search({ query: '测试', maxResults: 2 });
    expect(response.results).toHaveLength(2);
    expect(response.results[0]).toMatchObject({
      title: 'A',
      url: 'https://a.example/x',
      snippet: 'snippet a',
      source: 'google',
    });
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/search?');
  });

  it('SearXNG 429 映射为 rate_limited', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('limited', { status: 429 })));
    const provider = createSearchProvider(SETTINGS);
    await expect(provider.search({ query: 'x' })).rejects.toMatchObject({
      name: 'SearchError',
      reason: 'rate_limited',
      status: 429,
    });
  });

  it('mock 结果固定且不发起网络请求', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const provider = createSearchProvider({ ...SETTINGS, provider: 'mock' });
    const response = await provider.search({ query: 'hello', maxResults: 2 });
    expect(response.provider).toBe('mock');
    expect(response.results).toHaveLength(2);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('none 未配置时抛 not_configured', () => {
    expect(() => createSearchProvider({ ...SETTINGS, provider: 'none' })).toThrow(SearchError);
  });
});
