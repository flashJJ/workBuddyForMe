import { z } from 'zod';
import type { Tool, ToolResult } from './types';
import { ToolArgError } from './types';
import { safeFetchWebPage } from '../net/safe-web-fetch';

const OUTPUT_MAX_CHARS = 8_000;

const argsSchema = z.object({
  url: z.string().trim().min(1).max(2000),
});

/** 极简 HTML→纯文本：去脚本样式标签 → 剥标签 → 解码常见实体；不引第三方依赖 */
export function htmlToText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|iframe)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/(p|div|section|article|h[1-6]|li|tr|br)>/gi, '\n')
    .replace(/<br\s*\/?>(?!\n)/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n')
    .trim();
}

export const fetchWebpageTool: Tool = {
  name: 'fetch_webpage',
  description:
    '抓取一个公开网页（http/https）并提取正文纯文本，用于阅读用户给出的链接、查询公开资料。不能访问内网地址或需要登录的页面。',
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
    const text = htmlToText(html);
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
