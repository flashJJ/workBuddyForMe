import { describe, expect, it } from 'vitest';
import { degradedFetchResult, fetchUrlOf, shouldDegradeFetch } from './fetch-degrade';

describe('fetch 抓取降级判定（v2.27）', () => {
  it('网络/超时/页面过大属于可降级失败', () => {
    expect(
      shouldDegradeFetch({ ok: false, output: '抓取失败：fetch failed', summary: '抓取失败' }),
    ).toBe(true);
    expect(
      shouldDegradeFetch({ ok: false, output: '抓取失败：请求超时', summary: '抓取失败' }),
    ).toBe(true);
    expect(
      shouldDegradeFetch({ ok: false, output: '页面过大，正文未能解析', summary: '空页面' }),
    ).toBe(true);
  });

  it('鉴权、被拒与成功不触发降级', () => {
    expect(
      shouldDegradeFetch({ ok: false, output: '抓取失败：HTTP 403', summary: 'HTTP 403' }),
    ).toBe(false);
    expect(
      shouldDegradeFetch({ ok: false, output: '抓取失败：HTTP 401 unauthorized', summary: 'HTTP 401' }),
    ).toBe(false);
    expect(shouldDegradeFetch({ ok: true, output: 'ok', summary: 'ok' })).toBe(false);
    expect(
      shouldDegradeFetch({ ok: false, degraded: true, output: 'x', summary: 'y' }),
    ).toBe(false);
  });

  it('跳过结果标记 degraded 并提示改用搜索摘要', () => {
    const result = degradedFetchResult('https://example.com/a');
    expect(result.degraded).toBe(true);
    expect(result.output).toContain('不再重试');
    expect(result.evidence?.source).toBe('https://example.com/a');
  });

  it('URL 提取忽略空值与非法类型', () => {
    expect(fetchUrlOf({ url: ' https://a.com ' })).toBe('https://a.com');
    expect(fetchUrlOf({ url: '' })).toBeNull();
    expect(fetchUrlOf({ url: 42 })).toBeNull();
    expect(fetchUrlOf(null)).toBeNull();
  });
});
