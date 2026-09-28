import { z } from 'zod';
import type { Tool, ToolResult } from './types';
import { ToolArgError } from './types';
import { safeFetchWebPage } from '../net/safe-web-fetch';
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
      fetched = await safeFetchWebPage(parsed.data.url, ctx.signal);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const httpStatus = /HTTP (\d{3})/.exec(message)?.[1];
      return {
        ok: false,
        output: `抓取失败：${message}`,
        summary: httpStatus ? `HTTP ${httpStatus}` : '抓取失败',
      };
    }
    const { url, html } = fetched;
    const text = extractMainContent(html);
    if (!text) {
      return { ok: false, output: '页面无有效文本内容', summary: '空页面' };
    }
    const clipped = text.length > OUTPUT_MAX_CHARS ? text.slice(0, OUTPUT_MAX_CHARS) : text;
    return {
      ok: true,
      output: `网页 ${parsed.data.url} 正文（来源 ${url.hostname}，约 ${text.length} 字符）：\n\n${clipped}`,
      summary: `${url.hostname}（${text.length} 字符）`,
    };
  },
};
