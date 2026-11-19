import { z } from 'zod';
import {
  WEB_FETCH_FIRST_CHUNK_CHARS,
  WEB_PAGE_CACHE_MAX_CHARS,
  WEB_PAGE_CACHE_MAX_PAGES,
} from '@wbfm/shared/constants';
import type { Tool, ToolContext, ToolResult } from './types';
import { ToolArgError } from './types';
import {
  isJsonContentType,
  safeFetchWebPage,
  WEB_FETCH_ACCEPT_MIXED,
} from '../net/safe-web-fetch';
import { extractMainContent, extractPageOutline, extractPageTitle } from './html-extractor';
import type { CachedWebPage } from './types';

// v0.6 M4：htmlToText 迁至 html-extractor.ts，这里再导出保持调用方兼容
export { htmlToText } from './html-extractor';

const CHUNK_MIN = 2_000;
const CHUNK_MAX = 24_000;

const argsSchema = z.object({
  url: z.string().trim().min(1).max(2000),
  /** v4.11：从正文第几个字符开始读（命中回合缓存时不再发网络请求） */
  offset: z.number().int().min(0).optional(),
});

function chunkChars(ctx: ToolContext): number {
  const value = ctx.webFetchFirstChunkChars ?? WEB_FETCH_FIRST_CHUNK_CHARS;
  return Math.max(CHUNK_MIN, Math.min(CHUNK_MAX, Math.trunc(value)));
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function storePage(cache: Map<string, CachedWebPage>, page: CachedWebPage): void {
  cache.set(page.url, page);
  while (cache.size > WEB_PAGE_CACHE_MAX_PAGES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** 按 offset 渲染正文切片：首块附提纲，末尾提示可用 read_fetched 继续 */
export function renderPageSlice(
  page: CachedWebPage,
  offset: number,
  maxChars: number,
  kind = '正文',
): { text: string; start: number; end: number } {
  const start = Math.min(Math.max(0, offset), page.text.length);
  const end = Math.min(start + maxChars, page.text.length);
  const lines: string[] = [
    `网页 ${page.url} ${kind}（来源 ${hostOf(page.url)}，共 ${page.text.length} 字符，当前 ${start}–${end}）：`,
    '',
  ];
  if (start === 0 && page.outline.length > 0) {
    lines.push('提纲：', ...page.outline, '');
  }
  lines.push(page.text.slice(start, end));
  if (end < page.text.length) {
    lines.push(
      '',
      `[还有 ${page.text.length - end} 字符未读取；调用 read_fetched(url="${page.url}", offset=${end}) 继续]`,
    );
  }
  return { text: lines.join('\n'), start, end };
}

export const fetchWebpageTool: Tool = {
  name: 'fetch_webpage',
  description:
    '抓取一个公开网页（http/https）并提取正文纯文本。默认返回提纲与前部正文；页面较长时用 read_fetched 继续读取后续段落，不必重复抓取。不能访问内网地址或需要登录的页面。',
  // 只读公开网页（SSRF 已在 net/safe-web-fetch 逐跳校验）：与 web_search 同属 read，
  // 不再逐页 HITL——联网检索是对话高频路径，逐次人工确认会把一轮拖到分钟级。
  permission: 'read',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: '完整网页地址，必须以 http:// 或 https:// 开头' },
      offset: {
        type: 'integer',
        description: '可选：从正文第几个字符开始读；命中本回合缓存时不重复抓取',
      },
    },
    required: ['url'],
    additionalProperties: false,
  },

  async run(rawArgs, ctx): Promise<ToolResult> {
    const parsed = argsSchema.safeParse(rawArgs);
    if (!parsed.success) {
      throw new ToolArgError(parsed.error.issues.map((i) => i.message).join('；'));
    }
    const { url, offset = 0 } = parsed.data;
    const maxChars = chunkChars(ctx);

    // v4.11：命中回合缓存直接切片，避免同一页面重复走网络
    const cached = ctx.webCache?.get(url);
    if (cached) {
      const slice = renderPageSlice(cached, offset, maxChars);
      return {
        ok: true,
        output: slice.text,
        summary: `${hostOf(cached.url)}（${cached.text.length} 字符）`,
        evidence: {
          source: cached.url,
          coverage: `缓存 · 正文 ${cached.text.length} 字符 · 当前 ${slice.start}–${slice.end}`,
          ...(cached.truncated
            ? { limitations: ['页面超过抓取上限，已截取前部内容解析'] }
            : {}),
          capturedAt: new Date(cached.fetchedAt).toISOString(),
        },
      };
    }

    let fetched: Awaited<ReturnType<typeof safeFetchWebPage>>;
    try {
      // 对话场景超限时截取前 N 字节继续解析（剪藏路径仍保持硬失败）
      fetched = await safeFetchWebPage(url, ctx.signal, {
        ...(ctx.webFetchMaxBytes ? { maxBytes: ctx.webFetchMaxBytes } : {}),
        onOverflow: 'truncate',
        // 公开 API（如 api.github.com）对仅含 text/html 的 Accept 回 415，需声明 JSON
        accept: WEB_FETCH_ACCEPT_MIXED,
        allowJson: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const httpStatus = /HTTP (\d{3})/.exec(message)?.[1];
      return {
        ok: false,
        output: `抓取失败：${message}`,
        summary: httpStatus ? `HTTP ${httpStatus}` : '抓取失败',
        evidence: {
          source: url,
          coverage: '未获取正文',
          limitations: [message],
          capturedAt: new Date().toISOString(),
        },
      };
    }
    const { url: finalUrl, html, response, truncated } = fetched;
    const isJson = isJsonContentType(response.headers.get('content-type') ?? '');
    const text = isJson ? html.trim() : extractMainContent(html);
    const kind = isJson ? 'JSON 响应' : '正文';
    if (!text) {
      return {
        ok: false,
        output: '页面无有效文本内容',
        summary: '空页面',
        evidence: {
          source: finalUrl.href,
          coverage: `HTTP ${response.status} · 0 字符`,
          limitations: ['页面无有效文本内容'],
          capturedAt: new Date().toISOString(),
        },
      };
    }

    const page: CachedWebPage = {
      url: finalUrl.href,
      title: isJson ? null : extractPageTitle(html),
      text: text.length > WEB_PAGE_CACHE_MAX_CHARS ? text.slice(0, WEB_PAGE_CACHE_MAX_CHARS) : text,
      outline: isJson ? [] : extractPageOutline(html),
      truncated: truncated || text.length > WEB_PAGE_CACHE_MAX_CHARS,
      fetchedAt: Date.now(),
    };
    if (ctx.webCache) storePage(ctx.webCache, page);

    const slice = renderPageSlice(page, offset, maxChars, kind);
    const limitations: string[] = [];
    if (truncated) limitations.push('页面超过抓取上限，已截取前部内容解析');
    if (page.text.length > maxChars) limitations.push('仅返回前部正文，可继续读取后续段落');
    return {
      ok: true,
      output: slice.text,
      summary: isJson
        ? `${hostOf(page.url)} JSON（${page.text.length} 字符）`
        : `${hostOf(page.url)}（${page.text.length} 字符）`,
      evidence: {
        source: page.url,
        coverage: `HTTP ${response.status} · ${kind} ${page.text.length} 字符 · 当前 ${slice.start}–${slice.end}`,
        ...(limitations.length > 0 ? { limitations } : {}),
        capturedAt: new Date(page.fetchedAt).toISOString(),
      },
    };
  },
};
