import { Buffer } from 'node:buffer';
import { assertSafeUrlLiteral, resolveAndAssertHost, SsrfBlockedError } from '../tools/ssrf-guard';

/** 公开网页抓取的统一安全常量：fetch_webpage 工具与网页剪藏共用，禁止分叉 */
export const WEB_FETCH_TIMEOUT_MS = 8_000;
export const WEB_FETCH_MAX_BYTES = 200 * 1024;
export const WEB_FETCH_MAX_REDIRECTS = 3;

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
): Promise<{ response: Response; finalUrl: URL }> {
  let current = initial;
  for (let hop = 0; hop <= WEB_FETCH_MAX_REDIRECTS; hop += 1) {
    const response = await fetch(current, {
      method: 'GET',
      redirect: 'manual',
      signal,
      headers: { accept: 'text/html, text/plain' },
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

/** 有界读取响应体：超过 200KB 拒绝，仅 html/plain（含带 charset 的 content-type） */
export async function readBoundedText(response: Response, signal: AbortSignal): Promise<string> {
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
      if (total > WEB_FETCH_MAX_BYTES) throw new Error('页面超过 200KB 上限');
      chunks.push(value);
    }
    if (signal.aborted) throw new Error('读取被中断');
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
}

/** 抓取入口：URL 校验 → 8s 超时 → 逐跳复检 → 有界读取，返回 HTML 文本 */
export async function safeFetchWebPage(
  urlString: string,
  signal?: AbortSignal,
): Promise<{ url: URL; response: Response; html: string }> {
  const initial = await assertEveryHop(urlString);
  const timeout = AbortSignal.timeout(WEB_FETCH_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const { response, finalUrl } = await followRedirects(initial, combined);
  if (!response.ok) throw new Error(`抓取失败：HTTP ${response.status}`);
  const html = await readBoundedText(response, combined);
  return { url: finalUrl, response, html };
}

export { SsrfBlockedError };
