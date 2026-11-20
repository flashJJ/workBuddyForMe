import { WEB_FETCH_MAX_BYTES_DEFAULT } from '@wbfm/shared/constants';
import { assertSafeUrlLiteral, resolveAndAssertHost, SsrfBlockedError } from '../tools/ssrf-guard';

/** 公开网页抓取的统一安全常量：fetch_webpage 工具与网页剪藏共用，禁止分叉 */
export const WEB_FETCH_TIMEOUT_MS = 8_000;
/** 默认单页上限；调用方可通过 options.maxBytes 覆盖（设置页可调） */
export const WEB_FETCH_MAX_BYTES = WEB_FETCH_MAX_BYTES_DEFAULT;
export const WEB_FETCH_MAX_REDIRECTS = 3;

export interface WebFetchOptions {
  /** 单页读取字节上限，缺省 2MB */
  maxBytes?: number;
  /** 超限策略：throw=直接失败（剪藏，避免入库半篇）；truncate=截取前 N 字节继续解析（对话工具） */
  onOverflow?: 'throw' | 'truncate';
  /** Accept 头；默认只要网页文本。API 地址（如 GitHub REST）需要显式声明 application/json */
  accept?: string;
  /** 允许 JSON 响应体（仅对话抓取工具开启；剪藏保持只收 HTML/纯文本） */
  allowJson?: boolean;
}

/** 网页抓取默认 Accept：只要 HTML/纯文本 */
export const WEB_FETCH_ACCEPT_TEXT = 'text/html, text/plain';
/**
 * 对话工具用 Accept：额外声明 JSON。
 * 部分 API（如 api.github.com）对仅含 text/html 的 Accept 直接回 415，
 * 带上 application/json 后再按内容类型分支处理响应体。
 */
export const WEB_FETCH_ACCEPT_MIXED =
  'text/html, application/xhtml+xml, application/json;q=0.9, text/plain;q=0.9, */*;q=0.5';

/** 内容类型是否 JSON（含 application/vnd.github+json 这类 +json 后缀） */
export function isJsonContentType(contentType: string): boolean {
  return /[/+]json\b/i.test(contentType);
}

export interface BoundedReadResult {
  html: string;
  truncated: boolean;
}

/** 上限的人类可读文案（KB/MB），用于错误与证据说明 */
export function formatByteLimit(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    const mb = bytes / (1024 * 1024);
    return `${Number.isInteger(mb) ? mb : mb.toFixed(1)}MB`;
  }
  return `${Math.round(bytes / 1024)}KB`;
}

/** 每一跳重定向都重新做协议+IP 校验，防止 302 跳到 http://127.0.1/metadata */
export async function assertEveryHop(urlString: string): Promise<URL> {
  const url = assertSafeUrlLiteral(urlString);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const isIpLiteral = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':');
  if (!isIpLiteral) await resolveAndAssertHost(host);
  return url;
}

/** 手动跟随最多 3 跳重定向，每跳都过 SSRF 校验；返回最终响应与最终 URL */
export async function followRedirects(
  initial: URL,
  signal: AbortSignal,
  accept: string = WEB_FETCH_ACCEPT_TEXT,
): Promise<{ response: Response; finalUrl: URL }> {
  let current = initial;
  for (let hop = 0; hop <= WEB_FETCH_MAX_REDIRECTS; hop += 1) {
    const response = await fetch(current, {
      method: 'GET',
      redirect: 'manual',
      signal,
      headers: { accept },
    });
    if (response.status >= 300 && response.status < 400) {
      if (hop === WEB_FETCH_MAX_REDIRECTS) throw new Error('重定向超过 3 跳');
      const location = response.headers.get('location');
      if (!location) throw new Error('重定向响应缺少 Location');
      current = await assertEveryHop(new URL(location, current).href);
      continue;
    }
    return { response, finalUrl: current };
  }
  throw new Error('重定向超过 3 跳');
}

/** 有界读取响应体：超过上限按策略失败或截取，仅 html/plain（含带 charset 的 content-type） */
export async function readBoundedText(
  response: Response,
  signal: AbortSignal,
  options: WebFetchOptions = {},
): Promise<BoundedReadResult> {
  const maxBytes = options.maxBytes ?? WEB_FETCH_MAX_BYTES;
  const onOverflow = options.onOverflow ?? 'throw';
  const contentType = response.headers.get('content-type') ?? '';
  const textual = /text\/html|text\/plain|charset=/i.test(contentType);
  const json = options.allowJson === true && isJsonContentType(contentType);
  if (contentType && !textual && !json) {
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
      if (total + value.byteLength > maxBytes) {
        if (onOverflow === 'throw') {
          await reader.cancel().catch(() => undefined);
          throw new Error(`页面超过 ${formatByteLimit(maxBytes)} 上限`);
        }
        const allowed = maxBytes - total;
        if (allowed > 0) chunks.push(value.subarray(0, allowed));
        await reader.cancel().catch(() => undefined);
        return {
          html: decodeBody(chunks, contentType),
          truncated: true,
        };
      }
      total += value.byteLength;
      chunks.push(value);
    }
    if (signal.aborted) throw new Error('读取被中断');
  }
  return {
    html: decodeBody(chunks, contentType),
    truncated: false,
  };
}

/** 拼接响应块（避免依赖 Buffer，浏览器/Node 同构） */
function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

/**
 * 响应体按声明字符集解码。
 * 中文站点仍有大量 GBK/GB2312：content-type 缺省时嗅探头部 <meta charset>，
 * 仅 UTF-8 无脑解码会把整页变成乱码喂给模型。
 */
function decodeBody(chunks: Uint8Array[], contentType: string): string {
  const bytes = concatChunks(chunks);
  const label = normalizeCharset(detectCharset(bytes, contentType));
  if (label && label !== 'utf-8') {
    try {
      return new TextDecoder(label).decode(bytes);
    } catch {
      // 未知/不支持的 charset 回落 UTF-8
    }
  }
  return new TextDecoder('utf-8').decode(bytes);
}

/** content-type 优先；否则嗅探前 2KB 的 <meta charset> */
function detectCharset(bytes: Uint8Array, contentType: string): string | null {
  const fromHeader = /charset\s*=\s*["']?([\w-]+)/i.exec(contentType)?.[1];
  if (fromHeader) return fromHeader;
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 2048));
  return /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(head)?.[1] ?? null;
}

/** 历史别名归一：gb2312/gbk 统一按 GBK（超集）解码 */
function normalizeCharset(charset: string | null): string | null {
  if (!charset) return null;
  const label = charset.toLowerCase();
  return label === 'gb2312' || label === 'gb_2312-80' ? 'gbk' : label;
}

/** 抓取入口：URL 校验 → 8s 超时 → 逐跳复检 → 有界读取，返回 HTML 文本 */
export async function safeFetchWebPage(
  urlString: string,
  signal?: AbortSignal,
  options: WebFetchOptions = {},
): Promise<{ url: URL; response: Response; html: string; truncated: boolean }> {
  const initial = await assertEveryHop(urlString);
  const timeout = AbortSignal.timeout(WEB_FETCH_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const { response, finalUrl } = await followRedirects(initial, combined, options.accept);
  if (!response.ok) throw new Error(`抓取失败：HTTP ${response.status}`);
  const { html, truncated } = await readBoundedText(response, combined, options);
  return { url: finalUrl, response, html, truncated };
}

export { SsrfBlockedError };
