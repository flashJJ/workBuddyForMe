import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSearchProvider } from './index';
import { SearchError } from './types';
import type { SearchSettings } from '@wbfm/shared/types';

const BASE: SearchSettings = {
  provider: 'tavily',
  endpoint: '',
  maxResults: 2,
  timeoutMs: 5_000,
  allowPrivateEndpoint: false,
};

describe('Brave / Tavily 搜索适配器', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('Tavily 使用 Bearer Key 并映射结果', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            { title: 'A', url: 'https://a.example/x', content: 'snippet a' },
            { title: '', url: 'https://bad.example' },
          ],
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const provider = createSearchProvider(BASE, 'tvly-test');
    const response = await provider.search({ query: '测试', maxResults: 2 });

    expect(response.provider).toBe('tavily');
    expect(response.results).toHaveLength(1);
    expect(response.results[0]).toMatchObject({ title: 'A', source: 'a.example' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.tavily.com/search');
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer tvly-test',
    });
  });

  it('Brave 使用 X-Subscription-Token 并映射 web.results', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          web: { results: [{ title: 'B', url: 'https://b.example/y', description: 'snippet b' }] },
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const provider = createSearchProvider({ ...BASE, provider: 'brave' }, 'brave-test');
    const response = await provider.search({ query: '测试', maxResults: 2 });

    expect(response.provider).toBe('brave');
    expect(response.results[0]).toMatchObject({ title: 'B', source: 'b.example' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('api.search.brave.com/res/v1/web/search');
    expect((init as RequestInit).headers).toMatchObject({
      'X-Subscription-Token': 'brave-test',
    });
  });

  it('缺少 Key 时返回 not_configured', () => {
    expect(() => createSearchProvider(BASE, null)).toThrow(SearchError);
    expect(() => createSearchProvider(BASE, null)).toThrow(/Tavily API Key/);
  });

  it('401 映射为 auth_failed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('unauthorized', { status: 401 })));
    const provider = createSearchProvider(BASE, 'bad-key');
    await expect(provider.search({ query: 'x' })).rejects.toMatchObject({
      reason: 'auth_failed',
      status: 401,
    });
  });
});
