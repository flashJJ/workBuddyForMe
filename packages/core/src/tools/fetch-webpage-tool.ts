import { z } from 'zod';
import type { Tool, ToolResult } from './types';
import { ToolArgError } from './types';
import { assertSafeUrlLiteral, resolveAndAssertHost } from './ssrf-guard';

const FETCH_TIMEOUT_MS = 8_000;
const MAX_BYTES = 200 * 1024;
const MAX_REDIRECTS = 3;
const OUTPUT_MAX_CHARS = 8_000;

const argsSchema = z.object({
  url: z.string().trim().min(1).max(2000),
});

/** 每一跳重定向都重新做协议+IP 校验，防止 302 跳到 http://127.0.1/metadata */
async function assertEveryHop(urlString: string): Promise<URL> {
  const url = assertSafeUrlLiteral(urlString);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const isIpLiteral = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':');
  if (!isIpLiteral) await resolveAndAssertHost(host);
  return url;
}

async function followRedirects(initial: URL, signal: AbortSignal): Promise<Response> {
  let current = initial;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetch(current, {
      method: 'GET',
      redirect: 'manual',
      signal,
      headers: { accept: 'text/html, text/plain' },
    });
    if (response.status >= 300 && response.status < 400) {
      if (hop === MAX_REDIRECTS) throw new Error('重定向超过 3 跳');
      const location = response.headers.get('location');
      if (!location) throw new Error('重定向响应缺少 Location');
      current = await assertEveryHop(new URL(location, current).href);
      continue;
    }
    return response;
  }
  throw new Error('重定向超过 3 跳');
}

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

/** 有界读取响应体：超过 200KB 截断，拒绝二进制下载 */
async function readBoundedText(response: Response, signal: AbortSignal): Promise<string> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType && !/text\/html|text\/plain|charset=/i.test(contentType)) {
    throw new Error(`不支持的内容类型：${contentType.split(';')[0]}`);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('响应体不可读');
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > MAX_BYTES) throw new Error('页面超过 200KB 上限');
      chunks.push(value);
    }
    if (signal.aborted) throw new Error('读取被中断');
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
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
    const initial = await assertEveryHop(parsed.data.url);
    const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS);
    const signal = ctx.signal ? AbortSignal.any([ctx.signal, timeout]) : timeout;

    const response = await followRedirects(initial, signal);
    if (!response.ok) {
      return {
        ok: false,
        output: `抓取失败：HTTP ${response.status}`,
        summary: `HTTP ${response.status}`,
      };
    }
    const raw = await readBoundedText(response, signal);
    const text = htmlToText(raw);
    if (!text) {
      return { ok: false, output: '页面无有效文本内容', summary: '空页面' };
    }
    const clipped = text.length > OUTPUT_MAX_CHARS ? text.slice(0, OUTPUT_MAX_CHARS) : text;
    const host = initial.hostname;
    return {
      ok: true,
      output: `网页 ${parsed.data.url} 正文（来源 ${host}，约 ${text.length} 字符）：\n\n${clipped}`,
      summary: `${host}（${text.length} 字符）`,
    };
  },
};
