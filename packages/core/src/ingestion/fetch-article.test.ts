import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@wbfm/shared';
import {
  articleHtmlToText,
  fetchArticle,
  normalizeClipUrl,
  toClipError,
} from './fetch-article';
import { SsrfBlockedError } from '../net/safe-web-fetch';

const PUBLIC_IP = '8.8.8.8'; // 公网 IP 字面量，跳过 DNS，配合 fetch stub 零真实网络

const paragraph = '向量检索是语义搜索的基础能力，它把文本映射到高维空间后按距离排序。';
const SAMPLE_HTML = `<!doctype html><html><head>
<title>深入理解向量检索 - 示例博客</title></head>
<body><header>站点导航无关内容</header>
<article>
<h1>深入理解向量检索</h1>
<p>${paragraph.repeat(4)}</p>
<ul><li>要点一：分片策略影响召回</li><li>要点二：嵌入质量决定上限</li></ul>
<p>${paragraph.repeat(2)}</p>
</article></body></html>`;

function htmlResponse(html: string, status = 200, init?: ResponseInit) {
  return new Response(html, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    ...init,
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('网页剪藏（M3）', () => {
  it('normalizeClipUrl：去 utm_* 与 fragment，保留业务参数', () => {
    expect(normalizeClipUrl('http://example.com/a?utm_source=x&id=42#section')).toBe(
      'http://example.com/a?id=42',
    );
    expect(normalizeClipUrl('https://example.com/')).toBe('https://example.com/');
  });

  it('normalizeClipUrl：非法/非 http 协议抛 422', () => {
    expect(() => normalizeClipUrl('not a url')).toThrow(ApiError);
    expect(() => normalizeClipUrl('ftp://example.com/a')).toThrow(/http/);
  });

  it('articleHtmlToText：标题加 ##、列表加 -、脚本剥离与实体解码', () => {
    const text = articleHtmlToText(
      '<div><script>bad()</script><h2>小标题</h2><p>正文 &amp; 更多</p><ul><li>甲</li></ul></div>',
    );
    expect(text).toContain('## 小标题');
    expect(text).toContain('正文 & 更多');
    expect(text).toContain('- 甲');
    expect(text).not.toContain('bad()');
  });

  it('fetchArticle：抓取+抽取成功，URL 规范化、文件名取标题、buffer 含来源', async () => {
    const fetchMock = vi.fn(async () => htmlResponse(SAMPLE_HTML));
    vi.stubGlobal('fetch', fetchMock);

    const article = await fetchArticle(
      `http://${PUBLIC_IP}/article?utm_source=newsletter#section`,
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(article.url).toBe(`http://${PUBLIC_IP}/article`);
    expect(article.title).toContain('向量检索');
    expect(article.filename).toMatch(/向量检索.*\.md$/);
    expect(article.content).toContain('## 深入理解向量检索');
    expect(article.content).toContain('- 要点一');
    const decoded = new TextDecoder().decode(article.buffer);
    expect(decoded).toContain(`来源：http://${PUBLIC_IP}/article`);
    expect(decoded).toContain(paragraph);
  });

  it('fetchArticle：302 重定向逐跳复检后以落点 URL 为来源', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: `http://${PUBLIC_IP}/final` } }),
      )
      .mockResolvedValueOnce(htmlResponse(SAMPLE_HTML));
    vi.stubGlobal('fetch', fetchMock);

    const article = await fetchArticle(`http://${PUBLIC_IP}/old`);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(article.url).toBe(`http://${PUBLIC_IP}/final`);
  });

  it('fetchArticle：正文过薄（SPA 骨架页）抛可读 422', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => htmlResponse('<html><body>hi</body></html>')));
    await expect(fetchArticle(`http://${PUBLIC_IP}/thin`)).rejects.toThrowError(/未能从该页面/);
  });

  it('fetchArticle：内网 IP 在请求前即被 SSRF 拦截', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchArticle('http://127.0.0.1:11434/api/tags')).rejects.toBeInstanceOf(
      SsrfBlockedError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('toClipError：SSRF 与普通错误均归一为 422 可读信息', () => {
    expect(toClipError(new SsrfBlockedError('命中内网')).message).toContain('网页地址不安全');
    expect(toClipError(new Error('页面超过 200KB 上限')).message).toContain('网页抓取失败');
    const apiError = ApiError.validation('原文');
    expect(toClipError(apiError)).toBe(apiError);
  });
});
