import type { WebSearchInput, WebSearchResponse, WebSearchResult } from '@wbfm/shared/types';
import { withTimeout } from '../http/timeout-signal';
import type { SearchErrorReason, SearchProvider } from './types';
import { SearchError } from './types';

interface SearxngItem {
  title?: unknown;
  url?: unknown;
  content?: unknown;
  engine?: unknown;
  publishedDate?: unknown;
}

function buildSearchUrl(endpoint: string, input: WebSearchInput): string {
  const url = new URL(endpoint);
  if (!url.pathname.endsWith('/search')) {
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/search`;
  }
  url.searchParams.set('q', input.query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('categories', 'general');
  url.searchParams.set('pageno', '1');
  if (input.locale) url.searchParams.set('language', input.locale);
  return url.toString();
}

function mapItem(item: SearxngItem): WebSearchResult | null {
  const title = typeof item.title === 'string' ? item.title.trim() : '';
  const url = typeof item.url === 'string' ? item.url.trim() : '';
  const snippet = typeof item.content === 'string' ? item.content.trim() : '';
  if (!title || !url) return null;
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  const result: WebSearchResult = {
    title,
    url,
    snippet,
    source: typeof item.engine === 'string' && item.engine ? item.engine : host,
  };
  if (typeof item.publishedDate === 'string' && item.publishedDate) {
    result.publishedAt = item.publishedDate;
  }
  return result;
}

function statusError(status: number, detail: string): SearchError {
  const reason: SearchErrorReason =
    status === 401 || status === 403
      ? 'auth_failed'
      : status === 429
        ? 'rate_limited'
        : 'unreachable';
  const message =
    reason === 'auth_failed'
      ? `搜索服务鉴权失败（HTTP ${status}）`
      : reason === 'rate_limited'
        ? `搜索服务限流（HTTP ${status}）`
        : `搜索服务请求失败（HTTP ${status}）${detail ? `：${detail}` : ''}`;
  return new SearchError(reason, message, status);
}

/**
 * v2.17：SearXNG 搜索适配器（自建实例，JSON 输出，无 API Key）。
 * endpoint 由 core 侧先做协议/私网校验；这里只负责请求与结果映射。
 */
export function createSearxngProvider(endpoint: string, timeoutMs: number): SearchProvider {
  async function request(input: WebSearchInput, signal?: AbortSignal): Promise<WebSearchResponse> {
    const linked = withTimeout(signal, timeoutMs);
    try {
      const response = await fetch(buildSearchUrl(endpoint, input), {
        headers: { Accept: 'application/json' },
        signal: linked.signal,
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw statusError(response.status, detail.slice(0, 200));
      }
      const payload = (await response.json()) as { results?: unknown };
      if (!Array.isArray(payload.results)) {
        throw new SearchError('invalid_response', '搜索服务返回格式不正确：缺少 results 数组');
      }
      const maxResults = Math.max(1, Math.min(8, input.maxResults ?? 5));
      const results = payload.results
        .map((item) => mapItem(item as SearxngItem))
        .filter((item): item is WebSearchResult => item !== null)
        .slice(0, maxResults);
      return { provider: 'searxng', results };
    } catch (error) {
      if (error instanceof SearchError) throw error;
      if (linked.timedOut()) {
        throw new SearchError('unreachable', `搜索服务超时（${timeoutMs}ms）`);
      }
      if (signal?.aborted) throw error;
      throw new SearchError(
        'unreachable',
        `无法连接搜索服务：${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      linked.dispose();
    }
  }

  return {
    id: 'searxng',
    search: request,
    async testConnection() {
      try {
        await request({ query: 'ping', maxResults: 1 });
        return { ok: true, message: 'SearXNG 搜索服务可用' };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}
