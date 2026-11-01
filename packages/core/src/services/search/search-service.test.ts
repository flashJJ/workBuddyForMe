import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDatabase, createSettingsRepository } from '@wbfm/database';
import { SearchError } from '@wbfm/ai';
import { createSearchService } from './search-service';
import { resolveSearchSettings } from './search-settings';

describe('search service', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mock provider 返回结果且不发起网络请求', async () => {
    const db = createDatabase(':memory:');
    const settings = createSettingsRepository(db);
    settings.setJson('app-settings', {
      searchSettings: {
        provider: 'mock',
        endpoint: '',
        maxResults: 4,
        timeoutMs: 10_000,
        allowPrivateEndpoint: false,
      },
    });
    vi.stubGlobal('fetch', vi.fn());
    const search = createSearchService({ db });
    const result = await search.search({ query: 'hi', maxResults: 2 });
    expect(result.provider).toBe('mock');
    expect(result.results).toHaveLength(2);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('未启用时返回 not_configured', async () => {
    const db = createDatabase(':memory:');
    const search = createSearchService({ db });
    await expect(search.search({ query: 'hi' })).rejects.toMatchObject({
      name: 'SearchError',
      reason: 'not_configured',
    });
    await expect(search.testConnection()).resolves.toMatchObject({ ok: false });
  });

  it('自建 SearXNG 显式允许私网后可请求本机地址', async () => {
    const db = createDatabase(':memory:');
    const settings = createSettingsRepository(db);
    settings.setJson('app-settings', {
      searchSettings: {
        provider: 'searxng',
        endpoint: 'http://127.0.0.1:8080',
        maxResults: 2,
        timeoutMs: 5000,
        allowPrivateEndpoint: true,
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ results: [{ title: 'A', url: 'https://a.example', content: 'x' }] }), {
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const search = createSearchService({ db });
    const result = await search.search({ query: 'hi' });
    expect(result.results[0]?.title).toBe('A');
    expect(fetchMock.mock.calls[0]?.[0]).toContain('127.0.0.1:8080/search');
  });

  it('settings 钳制非法值', () => {
    expect(resolveSearchSettings({ provider: 'bad', maxResults: 99, timeoutMs: 1 })).toMatchObject({
      provider: 'none',
      maxResults: 8,
      timeoutMs: 1000,
    });
  });
});
