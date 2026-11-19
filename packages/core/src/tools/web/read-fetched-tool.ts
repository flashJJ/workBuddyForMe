import { z } from 'zod';
import { WEB_FETCH_FIRST_CHUNK_CHARS } from '@wbfm/shared/constants';
import type { Tool, ToolResult } from '../types';
import { ToolArgError } from '../types';
import { renderPageSlice } from '../fetch-webpage-tool';

const MAX_CHARS_MIN = 200;
const MAX_CHARS_MAX = 24_000;

const argsSchema = z.object({
  url: z.string().trim().min(1).max(2000),
  offset: z.number().int().min(0).optional(),
  maxChars: z.number().int().min(MAX_CHARS_MIN).max(MAX_CHARS_MAX).optional(),
});

/**
 * v4.11 分层抓取：从本回合已抓取的页面缓存继续读取正文，
 * 不重复发网络请求；配合 fetch_webpage 的提纲使用。
 */
export const readFetchedTool: Tool = {
  name: 'read_fetched',
  description:
    '继续读取本回合已抓取网页的后续正文。先用 fetch_webpage 抓取（会返回提纲与前部正文），再用本工具按 offset 读取后续段落，避免重复抓取同一页面。',
  permission: 'read',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: '本回合已抓取过的完整网页地址' },
      offset: { type: 'integer', description: '从正文第几个字符开始读，默认接上次返回的 offset' },
      maxChars: {
        type: 'integer',
        description: `本次最多读取的字符数（${MAX_CHARS_MIN}–${MAX_CHARS_MAX}），默认按检索深度档位`,
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
    if (!ctx.webCache) {
      return {
        ok: false,
        output: 'read_fetched 不可用：当前运行环境没有回合级网页缓存，请直接用 fetch_webpage 抓取。',
        summary: '缓存不可用',
        evidence: {
          source: parsed.data.url,
          coverage: '未读取',
          limitations: ['当前环境无网页缓存'],
          capturedAt: new Date().toISOString(),
        },
      };
    }
    const page = ctx.webCache.get(parsed.data.url);
    if (!page) {
      return {
        ok: false,
        output: `本回合尚未抓取该页面：${parsed.data.url}。请先调用 fetch_webpage 抓取，再用 read_fetched 继续读取。`,
        summary: '页面未缓存',
        evidence: {
          source: parsed.data.url,
          coverage: '未读取',
          limitations: ['该 URL 不在本回合缓存中'],
          capturedAt: new Date().toISOString(),
        },
      };
    }

    // 命中即刷新 LRU 顺序，避免长回合里把正在读的页面挤掉
    ctx.webCache.delete(parsed.data.url);
    ctx.webCache.set(parsed.data.url, page);

    const maxChars =
      parsed.data.maxChars ??
      Math.max(MAX_CHARS_MIN, Math.min(MAX_CHARS_MAX, ctx.webFetchFirstChunkChars ?? WEB_FETCH_FIRST_CHUNK_CHARS));
    const offset = parsed.data.offset ?? 0;
    const slice = renderPageSlice(page, offset, maxChars, offset > 0 ? '正文续读' : '正文');
    return {
      ok: true,
      output: slice.text,
      summary: `${page.title ?? new URL(page.url).hostname} · ${slice.start}–${slice.end} / ${page.text.length}`,
      evidence: {
        source: page.url,
        coverage: `缓存 · 正文 ${page.text.length} 字符 · 当前 ${slice.start}–${slice.end}`,
        capturedAt: new Date(page.fetchedAt).toISOString(),
      },
    };
  },
};
