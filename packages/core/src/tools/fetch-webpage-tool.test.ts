import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeToolCall } from './tool-executor';
import type { ToolContext } from './types';
import { fetchWebpageTool, htmlToText } from './fetch-webpage-tool';

const ctx: ToolContext = { knowledgeBaseId: null, retrieve: async () => [] };

function htmlResponse(body: string, contentType = 'text/html; charset=utf-8', status = 200) {
  return new Response(body, {
    status,
    headers: { 'content-type': contentType },
  });
}

describe('fetch_webpage 工具', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('htmlToText：剥脚本/标签、解码实体、块级换行', () => {
    const html =
      '<html><head><style>x{}</style><script>alert(1)</script></head>' +
      '<body><h1>标题</h1><p>正文&nbsp;A &amp; B</p>' +
      '<a href="x">链接</a></body></html>';
    const text = htmlToText(html);
    expect(text).toContain('标题');
    expect(text).toContain('正文 A & B');
    expect(text).toContain('链接');
    expect(text).not.toContain('alert');
    expect(text).not.toContain('<');
  });

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

  it('HTTP 404 归一为失败结果', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(htmlResponse('nope', 'text/plain', 404)));
    const result = await executeToolCall(fetchWebpageTool, { url: 'http://8.8.8.8/missing' }, ctx);
    expect(result.ok).toBe(false);
    expect(result.summary).toBe('HTTP 404');
  });

  it('缺少 url 参数：参数错误回灌', async () => {
    const result = await executeToolCall(fetchWebpageTool, {}, ctx);
    expect(result.ok).toBe(false);
    expect(result.output).toContain('参数错误');
  });
});
