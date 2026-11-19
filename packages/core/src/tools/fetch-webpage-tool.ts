import { z } from 'zod';
import type { Tool, ToolResult } from './types';
import { ToolArgError } from './types';
import {
  isJsonContentType,
  safeFetchWebPage,
  WEB_FETCH_ACCEPT_MIXED,
} from '../net/safe-web-fetch';
import { extractMainContent } from './html-extractor';

// v0.6 M4：htmlToText 迁至 html-extractor.ts，这里再导出保持调用方兼容
export { htmlToText } from './html-extractor';

const OUTPUT_MAX_CHARS = 8_000;

const argsSchema = z.object({
  url: z.string().trim().min(1).max(2000),
});

export const fetchWebpageTool: Tool = {
  name: 'fetch_webpage',
  description:
    '抓取一个公开网页（http/https）并提取正文纯文本，用于阅读用户给出的链接、查询公开资料。不能访问内网地址或需要登录的页面。',
  permission: 'danger',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: '完整网页地址，必须以 http:// 或 https:// 开头' },
    },
    required: ['url'],
    additionalProperties: false,
  },

  async run(rawArgs, ctx): Promise<ToolResult> {
    const parsed = argsSchema.safeParse(rawArgs);
    if (!parsed.success) {
      throw new ToolArgError(parsed.error.issues.map((i) => i.message).join('；'));
    }
    let fetched: Awaited<ReturnType<typeof safeFetchWebPage>>;
    try {
      // 对话场景超限时截取前 N 字节继续解析（剪藏路径仍保持硬失败）
      fetched = await safeFetchWebPage(parsed.data.url, ctx.signal, {
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
          source: parsed.data.url,
          coverage: '未获取正文',
          limitations: [message],
          capturedAt: new Date().toISOString(),
        },
      };
    }
    const { url, html, response, truncated } = fetched;
    const isJson = isJsonContentType(response.headers.get('content-type') ?? '');
    // JSON 响应不做 HTML 正文抽取，直接回灌原文供模型阅读
    const text = isJson ? html.trim() : extractMainContent(html);
    const kind = isJson ? 'JSON 响应' : '正文';
    if (!text) {
      return {
        ok: false,
        output: '页面无有效文本内容',
        summary: '空页面',
        evidence: {
          source: url.href,
          coverage: `HTTP ${response.status} · 0 字符`,
          limitations: ['页面无有效文本内容'],
          capturedAt: new Date().toISOString(),
        },
      };
    }
    const clipped = text.length > OUTPUT_MAX_CHARS ? text.slice(0, OUTPUT_MAX_CHARS) : text;
    const limitations: string[] = [];
    if (truncated) limitations.push('页面超过抓取上限，已截取前部内容解析');
    if (text.length > OUTPUT_MAX_CHARS) limitations.push(`输出截断至 ${OUTPUT_MAX_CHARS} 字符`);
    return {
      ok: true,
      output: `网页 ${parsed.data.url} ${kind}（来源 ${url.hostname}，约 ${text.length} 字符）：\n\n${clipped}`,
      summary: isJson
        ? `${url.hostname} JSON（${text.length} 字符）`
        : `${url.hostname}（${text.length} 字符）`,
      evidence: {
        source: url.href,
        coverage: `HTTP ${response.status} · ${kind} ${text.length} 字符`,
        ...(limitations.length > 0 ? { limitations } : {}),
        capturedAt: new Date().toISOString(),
      },
    };
  },
};
