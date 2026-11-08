import { z } from 'zod';
import type { Tool, ToolResult } from '../types';
import { ToolArgError } from '../types';

const OUTPUT_MAX_CHARS = 8_000;
const SNIPPET_MAX_CHARS = 300;

const argsSchema = z.object({
  query: z.string().trim().min(1).max(200),
  maxResults: z.number().int().min(1).max(8).optional(),
  freshness: z.enum(['day', 'week', 'month', 'year']).optional(),
  site: z.string().trim().max(200).optional(),
  locale: z.string().trim().max(20).optional(),
});

/** v2.17：内置联网搜索工具；provider 与治理由 core 搜索服务负责 */
export const webSearchTool: Tool = {
  name: 'web_search',
  description:
    '联网搜索公开网页，返回标题、链接与摘要。用于查询最新资料、事实与来源；搜索词会发送到用户配置的搜索服务。需要读取网页正文时再用 fetch_webpage。',
  permission: 'read',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '搜索词，1–200 字' },
      maxResults: { type: 'integer', description: '返回条数 1–8，默认 5' },
      freshness: {
        type: 'string',
        enum: ['day', 'week', 'month', 'year'],
        description: '可选时间范围',
      },
      site: { type: 'string', description: '可选：限定站点' },
      locale: { type: 'string', description: '可选：语言/地区，如 zh-CN' },
    },
    required: ['query'],
    additionalProperties: false,
  },

  async run(rawArgs, ctx): Promise<ToolResult> {
    const parsed = argsSchema.safeParse(rawArgs);
    if (!parsed.success) {
      throw new ToolArgError(parsed.error.issues.map((i) => i.message).join('；'));
    }
    if (!ctx.searchWeb) {
      return {
        ok: false,
        output: '联网搜索未配置：请到设置 → 工具与权限 → 联网搜索选择搜索服务。',
        summary: '未配置搜索',
        evidence: {
          source: '联网搜索',
          coverage: '0 条结果',
          limitations: ['未配置搜索服务'],
          capturedAt: new Date().toISOString(),
        },
      };
    }
    try {
      const response = await ctx.searchWeb(
        {
          query: parsed.data.query,
          ...(parsed.data.maxResults !== undefined
            ? { maxResults: parsed.data.maxResults }
            : {}),
          ...(parsed.data.freshness ? { freshness: parsed.data.freshness } : {}),
          ...(parsed.data.site ? { site: parsed.data.site } : {}),
          ...(parsed.data.locale ? { locale: parsed.data.locale } : {}),
        },
        ctx.signal,
      );
      if (response.results.length === 0) {
        return {
          ok: false,
          output: '没有搜索到相关结果',
          summary: `${response.provider} · 0 条`,
          evidence: {
            source: response.provider,
            coverage: '0 条结果',
            limitations: ['未检索到相关结果'],
            capturedAt: new Date().toISOString(),
          },
        };
      }
      const lines = response.results.map((result, index) => {
        const snippet =
          result.snippet.length > SNIPPET_MAX_CHARS
            ? `${result.snippet.slice(0, SNIPPET_MAX_CHARS)}…`
            : result.snippet;
        return `${index + 1}. ${result.title}\n   ${result.url}\n   ${snippet}`;
      });
      const body = `搜索结果（${response.provider}，${response.results.length} 条）：\n\n${lines.join('\n\n')}`;
      const clipped = body.length > OUTPUT_MAX_CHARS ? body.slice(0, OUTPUT_MAX_CHARS) : body;
      const limitations = [
        ...(response.results.some((result) => result.snippet.length > SNIPPET_MAX_CHARS)
          ? [`部分摘要截断至 ${SNIPPET_MAX_CHARS} 字符`]
          : []),
        ...(body.length > OUTPUT_MAX_CHARS ? [`输出截断至 ${OUTPUT_MAX_CHARS} 字符`] : []),
      ];
      return {
        ok: true,
        output: clipped,
        summary: `${response.provider} · ${response.results.length} 条`,
        evidence: {
          source: response.provider,
          coverage: `${response.results.length} 条结果`,
          ...(limitations.length ? { limitations } : {}),
          capturedAt: new Date().toISOString(),
        },
        citations: response.results.map((result) => ({
          documentId: result.url,
          documentName: result.title,
          // v2.27：网页结果无文档分片，ordinal 固定 0；展示编号由装配层 citeIndex 统一分配
          ordinal: 0,
          snippet: result.snippet,
          sourceUrl: result.url,
          staticKind: 'chunk',
        })),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        output: `搜索失败：${message}`,
        summary: '搜索失败',
        evidence: {
          source: '联网搜索',
          coverage: '0 条结果',
          limitations: [`搜索失败：${message}`],
          capturedAt: new Date().toISOString(),
        },
      };
    }
  },
};
