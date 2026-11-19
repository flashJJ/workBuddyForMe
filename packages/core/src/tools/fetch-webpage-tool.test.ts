import { beforeEach, describe, expect, it } from 'vitest';
import { HttpResponse, http, setupMsw } from '@wbfm/ai/testing/msw';
import { executeToolCall } from './tool-executor';
import type { CachedWebPage, ToolContext } from './types';
import { fetchWebpageTool } from './fetch-webpage-tool';

/**
 * v4.11 P1-1：本文件已从 `vi.stubGlobal('fetch')` 迁移到 MSW handler。
 * 路由表按测试覆盖，handler 内记录请求头/redirect/次数。
 */
const ORIGIN = 'http://8.8.8.8';
const ctx: ToolContext = { knowledgeBaseIds: [], retrieve: async () => [] };

interface RecordedCall {
  url: string;
  accept: string | null;
}

let calls: RecordedCall[] = [];
let routes: Record<string, () => Response> = {};

setupMsw([
  http.get(/^http:\/\/8\.8\.8\.8\//, ({ request }) => {
    const url = new URL(request.url);
    calls.push({ url: url.href, accept: request.headers.get('accept') });
    const handler = routes[url.pathname];
    return handler ? handler() : new HttpResponse('not found', { status: 404 });
  }),
]);

function html(body: string, contentType = 'text/html; charset=utf-8', status = 200): Response {
  return new HttpResponse(body, { status, headers: { 'content-type': contentType } });
}

beforeEach(() => {
  calls = [];
  routes = {};
});

describe('fetch_webpage 工具（MSW）', () => {
  it('正常抓取公网页面：输出含来源主机与正文', async () => {
    routes['/news'] = () => html('<!doctype html><title>T</title><p>你好世界</p>');
    const result = await executeToolCall(fetchWebpageTool, { url: `${ORIGIN}/news` }, ctx);

    expect(result.ok).toBe(true);
    expect(result.summary).toContain('8.8.8.8');
    expect(result.output).toContain('你好世界');
    expect(result.evidence).toMatchObject({
      source: `${ORIGIN}/news`,
      coverage: expect.stringContaining('HTTP 200'),
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.accept).toContain('text/html');
  });

  it('SSRF：内网 IP 字面量直接拦截，不发起请求', async () => {
    const result = await executeToolCall(fetchWebpageTool, { url: 'http://127.0.0.1:3000/admin' }, ctx);
    expect(result.ok).toBe(false);
    expect(result.output).toContain('127.0.0.1');
    expect(calls).toHaveLength(0);
  });

  it('SSRF：重定向跳到内网时在第二跳拦截', async () => {
    routes['/redirect'] = () =>
      new HttpResponse(null, { status: 302, headers: { location: 'http://169.254.169.254/' } });
    const result = await executeToolCall(
      fetchWebpageTool,
      { url: `${ORIGIN}/redirect` },
      ctx,
    );
    expect(result.ok).toBe(false);
    expect(result.output).toContain('169.254.169.254');
    expect(calls).toHaveLength(1);
  });

  it('非文本内容类型（如下载二进制）返回失败', async () => {
    routes['/a.zip'] = () => html('x', 'application/zip');
    const result = await executeToolCall(fetchWebpageTool, { url: `${ORIGIN}/a.zip` }, ctx);
    expect(result.ok).toBe(false);
    expect(result.output).toContain('内容类型');
  });

  it('API JSON 响应（vnd.github+json）：Accept 声明 application/json，原文回灌', async () => {
    routes['/repos/infiniflow/ragflow'] = () =>
      html('{"full_name":"infiniflow/ragflow","stargazers_count":123}', 'application/vnd.github+json');
    const result = await executeToolCall(
      fetchWebpageTool,
      { url: `${ORIGIN}/repos/infiniflow/ragflow` },
      ctx,
    );
    expect(result.ok).toBe(true);
    expect(result.output).toContain('"full_name":"infiniflow/ragflow"');
    expect(result.summary).toContain('JSON');
    expect(calls[0]!.accept).toContain('application/json');
  });

  it('HTTP 404 归一为失败结果', async () => {
    routes['/missing'] = () => html('nope', 'text/plain', 404);
    const result = await executeToolCall(fetchWebpageTool, { url: `${ORIGIN}/missing` }, ctx);
    expect(result.ok).toBe(false);
    expect(result.summary).toBe('HTTP 404');
    expect(result.evidence?.coverage).toBe('未获取正文');
    expect(result.evidence?.limitations?.[0]).toContain('HTTP 404');
  });

  it('超过抓取上限时截取前部内容继续解析，不判失败', async () => {
    routes['/big'] = () =>
      html(`<html><body><article><p>${'你好'.repeat(2000)}</p></article></body></html>`);
    const result = await executeToolCall(
      fetchWebpageTool,
      { url: `${ORIGIN}/big` },
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
    routes['/news'] = () => html('<article><p>你好世界</p></article>');
    const webCache = new Map<string, CachedWebPage>();
    const withCache = { ...ctx, webCache };

    const first = await executeToolCall(fetchWebpageTool, { url: `${ORIGIN}/news` }, withCache);
    expect(first.ok).toBe(true);
    expect(webCache.size).toBe(1);

    const second = await executeToolCall(
      fetchWebpageTool,
      { url: `${ORIGIN}/news`, offset: 2 },
      withCache,
    );
    expect(second.ok).toBe(true);
    expect(calls).toHaveLength(1);
  });
});
