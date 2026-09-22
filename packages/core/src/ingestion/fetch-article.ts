import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import { ApiError } from '@wbfm/shared';
import { safeFetchWebPage, SsrfBlockedError } from '../net/safe-web-fetch';

export interface ClippedArticle {
  /** 规范化后的最终来源 URL（去跟踪参数/fragment，重定向后落点） */
  url: string;
  title: string;
  /** Markdown 风格正文纯文本（标题/列表/段落保留换行） */
  content: string;
  /** 入库用文本：标题 + 来源 + 正文 */
  buffer: Uint8Array;
  /** 文档列表展示用文件名（含 .md 以复用纯文本摄入解析） */
  filename: string;
}

const TRACKING_PARAM = /^utm_/i;

/** 规范化剪藏 URL：去 utm_* 跟踪参数与 fragment，用于去重与来源落库 */
export function normalizeClipUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw ApiError.validation(`URL 无法解析：${raw}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw ApiError.validation('仅支持 http/https 网页地址');
  }
  const params = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (!TRACKING_PARAM.test(key)) params.append(key, value);
  }
  url.search = params.toString();
  url.hash = '';
  return url.toString();
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

/** Readability 正文 HTML → Markdown 风格纯文本：h1-6 加 ##，li 加 -，段落换行 */
export function articleHtmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(script|style|noscript|iframe)[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, '\n## $1\n')
      .replace(/<li[^>]*>/gi, '\n- ')
      .replace(/<\/(p|div|section|article|li|tr|blockquote)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

function sanitizeFilename(title: string): string {
  return (
    title
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || '未命名网页'
  );
}

/**
 * 抓取并抽取公开网页正文（网页剪藏）：
 * 安全链路与 fetch_webpage 工具共用（SSRF/重定向/超时/有界读取），
 * 正文抽取用 Readability + linkedom 轻量 DOM；产出直接进现有摄入管线。
 */
export async function fetchArticle(rawUrl: string, signal?: AbortSignal): Promise<ClippedArticle> {
  const { url, html } = await safeFetchWebPage(rawUrl, signal);
  const canonical = normalizeClipUrl(url.toString());

  const { document } = parseHTML(html);
  type ReadabilityDocument = ConstructorParameters<typeof Readability>[0];
  let parsed: { title?: string | null; content?: string | null } | null = null;
  try {
    parsed = new Readability(document as unknown as ReadabilityDocument, {
      charThreshold: 200,
    }).parse();
  } catch {
    parsed = null;
  }

  const text = parsed?.content ? articleHtmlToText(parsed.content) : '';
  if (text.length < 50) {
    throw ApiError.validation('未能从该页面提取有效正文（可能需要登录、为 SPA 骨架页或反爬页面）');
  }

  const rawTitle = (parsed?.title ?? document.title ?? '').trim();
  const title = rawTitle || `${url.hostname}${url.pathname}`.replace(/\/$/, '');
  const content = `# ${title}\n来源：${canonical}\n\n${text}`;

  return {
    url: canonical,
    title,
    content: text,
    filename: `${sanitizeFilename(title)}.md`,
    buffer: new TextEncoder().encode(content),
  };
}

/** 剪藏入口错误归一：SSRF 拦截 → 422 可读提示，不暴露内网细节 */
export function toClipError(error: unknown): Error {
  if (error instanceof ApiError) return error;
  if (error instanceof SsrfBlockedError) return ApiError.validation(`网页地址不安全：${error.message}`);
  const message = error instanceof Error ? error.message : String(error);
  return ApiError.validation(`网页抓取失败：${message}`);
}
