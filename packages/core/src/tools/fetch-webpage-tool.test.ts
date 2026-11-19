import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeToolCall } from './tool-executor';
import type { CachedWebPage, ToolContext } from './types';
import { fetchWebpageTool } from './fetch-webpage-tool';

const ctx: ToolContext = { knowledgeBaseIds: [], retrieve: async () => [] };

function htmlResponse(body: string, contentType = 'text/html; charset=utf-8', status = 200) {
  return new Response(body, {
    status,
    headers: { 'content-type': contentType },
  });
}

describe('fetch_webpage 工具', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('正常抓取公网页面：输出含来源主机与正文', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      htmlResponse('<!doctype html><title>T</title><p>你好世界</p>'),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeToolCall(
      fetchWebpageTool,
      { url: 'http://8.8.8.8/news' },
      ctx,
    );
    expect(result.ok).toBe(true);
    expect(result.summary).toContain('8.8.8.8');
    expect(result.output).toContain('你好世界');
    expect(result.evidence).toMatchObject({
      source: 'http://8.8.8.8/news',
      coverage: expect.stringContaining('HTTP 200'),
    });
    const [requestUrl, init] = fetchMock.mock.calls[0]!;
    expect(String(requestUrl)).toBe('http://8.8.8.8/news');
    expect((init as RequestInit).redirect).toBe('manual');
  });

  it('SSRF：内网 IP 字面量直接拦截，不发起请求', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await executeToolCall(
      fetchWebpageTool,
      { url: 'http://127.0.0.1:3000/admin' },
      ctx,
    );
    expect(result.ok).toBe(false);
    expect(result.output).toContain('127.0.0.1');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('SSRF：重定向跳到内网时在第二跳拦截', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const result = await executeToolCall(
      fetchWebpageTool,
      { url: 'http://8.8.8.8/redirect' },
      ctx,
    );
    expect(result.ok).toBe(false);
    expect(result.output).toContain('169.254.169.254');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('非文本内容类型（如下载二进制）返回失败', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(htmlResponse('x', 'application/zip')));
    const result = await executeToolCall(fetchWebpageTool, { url: 'http://8.8.8.8/a.zip' }, ctx);
    expect(result.ok).toBe(false);
    expect(result.output).toContain('内容类型');
  });

  it('API JSON 响应（vnd.github+json）：Accept 声明 application/json，原文回灌', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        htmlResponse(
          '{"full_name":"infiniflow/ragflow","stargazers_count":123}',
          'application/vnd.github+json',
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const result = await executeToolCall(
      fetchWebpageTool,
      { url: 'http://8.8.8.8/repos/infiniflow/ragflow' },
      ctx,
    );
    expect(result.ok).toBe(true);
    expect(result.output).toContain('"full_name":"infiniflow/ragflow"');
    expect(result.summary).toContain('JSON');
    const init = fetchMock.mock.calls[0]![1] as RequestInit & { headers: Record<string, string> };
    expect(init.headers.accept).toContain('application/json');
  });

  it('HTTP 404 归一为失败结果', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(htmlResponse('nope', 'text/plain', 404)));
    const result = await executeToolCall(fetchWebpageTool, { url: 'http://8.8.8.8/missing' }, ctx);
    expect(result.ok).toBe(false);
    expect(result.summary).toBe('HTTP 404');
    expect(result.evidence?.coverage).toBe('未获取正文');
    expect(result.evidence?.limitations?.[0]).toContain('HTTP 404');
  });

  it('超过抓取上限时截取前部内容继续解析，不判失败', async () => {
    const body = `<html><body><article><p>${'你好'.repeat(2000)}</p></article></body></html>`;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(htmlResponse(body)));
    const result = await executeToolCall(
      fetchWebpageTool,
      { url: 'http://8.8.8.8/big' },
      { ...ctx, webFetchMaxBytes: 1024 },
    );
    expect(result.ok).toBe(true);
    expect(result.evidence?.limitations?.join(' ')).toContain('截取前部');
  });

  it('缺少 url 参数：参数错误回灌', async () => {
    const result = await executeToolCall(fetchWebpageTool, {}, ctx);
    expect(result.ok).toBe(false);
    expect(result.output).toContain('参数错误');
  });

  it('v4.11：同一 URL 第二次抓取命中回合缓存，不再发网络请求', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(htmlResponse('<article><p>你好世界</p></article>'));
    vi.stubGlobal('fetch', fetchMock);
    const webCache = new Map<string, CachedWebPage>();
    const withCache = { ...ctx, webCache };

    const first = await executeToolCall(
      fetchWebpageTool,
      { url: 'http://8.8.8.8/news' },
      withCache,
    );
    expect(first.ok).toBe(true);
    expect(webCache.size).toBe(1);

    const second = await executeToolCall(
      fetchWebpageTool,
      { url: 'http://8.8.8.8/news', offset: 2 },
      withCache,
    );
    expect(second.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
