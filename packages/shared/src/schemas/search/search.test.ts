import { describe, expect, it } from 'vitest';
import {
  SEARCH_LIMITS,
  SEARCH_MIN_QUERY_LENGTH,
  SEARCH_SNIPPET_MAX,
  searchGroupSchema,
  searchResponseSchema,
  searchResultSchema,
} from './index';

const hit = {
  domain: 'chat' as const,
  id: 'event-1',
  title: '青鸟计划周会',
  snippet: '接口版本 v2.3，超时 8000 毫秒',
  timestamp: '2026-11-22T03:00:00.000Z',
  deepLink: '/chat/c1?message=m1',
  action: 'open' as const,
};

describe('v4.18 跨域检索契约', () => {
  it('接受五域合法结果', () => {
    for (const domain of ['chat', 'task', 'flow', 'meeting', 'knowledge'] as const) {
      expect(searchResultSchema.safeParse({ ...hit, domain }).success).toBe(true);
    }
  });

  it('五域之外或缺少深链时拒绝', () => {
    expect(searchResultSchema.safeParse({ ...hit, domain: 'agent' }).success).toBe(false);
    expect(searchResultSchema.safeParse({ ...hit, deepLink: '' }).success).toBe(false);
  });

  it('片段超长时拒绝', () => {
    expect(
      searchResultSchema.safeParse({ ...hit, snippet: 'x'.repeat(SEARCH_SNIPPET_MAX + 1) }).success,
    ).toBe(false);
  });

  it('单域最多 10 条', () => {
    const results = Array.from({ length: SEARCH_LIMITS.perDomain + 1 }, (_, index) => ({
      ...hit,
      id: `event-${index}`,
    }));
    expect(searchGroupSchema.safeParse({ domain: 'chat', results, failed: false }).success).toBe(
      false,
    );
  });

  it('总计最多 50 条', () => {
    expect(
      searchResponseSchema.safeParse({ query: '青鸟', groups: [], total: SEARCH_LIMITS.total })
        .success,
    ).toBe(true);
    expect(
      searchResponseSchema.safeParse({ query: '青鸟', groups: [], total: SEARCH_LIMITS.total + 1 })
        .success,
    ).toBe(false);
  });

  it('检索至少 2 个字符', () => {
    expect(SEARCH_MIN_QUERY_LENGTH).toBe(2);
  });
});
