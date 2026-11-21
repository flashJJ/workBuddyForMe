import { describe, expect, it } from 'vitest';
import type { SearchSettings } from '@wbfm/shared/types';
import { localSearchEndpointOf } from './local-search';

function settings(overrides: Partial<SearchSettings>): SearchSettings {
  return {
    provider: 'searxng',
    endpoint: 'http://localhost:8080',
    maxResults: 5,
    timeoutMs: 8000,
    allowPrivateEndpoint: true,
    fetchMaxBytes: 2_000_000,
    researchDepth: 'standard',
    ...overrides,
  };
}

describe('localSearchEndpointOf', () => {
  it.each(['http://localhost:8080', 'http://127.0.0.1:8888', 'http://[::1]:8080'])(
    '识别本机端点 %s',
    (endpoint) => {
      expect(localSearchEndpointOf(settings({ endpoint }))).toBe(endpoint);
    },
  );

  it('公网自建实例不触发', () => {
    expect(localSearchEndpointOf(settings({ endpoint: 'https://search.example.com' }))).toBeUndefined();
  });

  it('非 searxng provider 不触发', () => {
    expect(localSearchEndpointOf(settings({ provider: 'brave' }))).toBeUndefined();
  });

  it('空地址或非法 URL 不触发', () => {
    expect(localSearchEndpointOf(settings({ endpoint: '   ' }))).toBeUndefined();
    expect(localSearchEndpointOf(settings({ endpoint: 'not a url' }))).toBeUndefined();
  });
});
