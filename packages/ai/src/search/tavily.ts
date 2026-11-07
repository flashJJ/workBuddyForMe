import type { WebSearchInput, WebSearchResponse, WebSearchResult } from '@wbfm/shared/types';
import { withTimeout } from '../http/timeout-signal';
import type { SearchProvider } from './types';
import { SearchError } from './types';

const ENDPOINT = 'https://api.tavily.com/search';

interface TavilyItem {
  title?: unknown;
  url?: unknown;
  content?: unknown;
  published_date?: unknown;
}

function statusError(status: number): SearchError {
  if (status === 401 || status === 403) {
    return new SearchError('auth_failed', 'Tavily 拒绝请求：API Key 无效或无权限', status);
  }
  if (status === 429) return new SearchError('rate_limited', 'Tavily 限流（HTTP 429）', status);
  if (status === 432 || status === 433) {
    return new SearchError('rate_limited', 'Tavily 额度已用尽，请检查账户配额', status);
  }
  return new SearchError('unreachable', `Tavily 请求失败（HTTP ${status}）`, status);
}

function mapItem(item: TavilyItem): WebSearchResult | null {
  const title = typeof item.title === 'string' ? item.title.trim() : '';
  const url = typeof item.url === 'string' ? item.url.trim() : '';
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
    snippet: typeof item.content === 'string' ? item.content.trim() : '',
    source: host,
  };
  if (typeof item.published_date === 'string' && item.published_date) {
    result.publishedAt = item.published_date;
  }
  return result;
}

/** v2.24：Tavily 搜索适配器（API Key，官方 /search 端点） */
export function createTavilyProvider(apiKey: string, timeoutMs: number): SearchProvider {
  async function request(input: WebSearchInput, signal?: AbortSignal): Promise<WebSearchResponse> {
    const linked = withTimeout(signal, timeoutMs);
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          api_key: apiKey,
          query: input.query,
          max_results: Math.max(1, Math.min(8, input.maxResults ?? 5)),
          search_depth: 'basic',
          include_answer: false,
        }),
        signal: linked.signal,
      });
      if (!response.ok) {
        await response.text().catch(() => '');
        throw statusError(response.status);
      }
      const payload = (await response.json()) as { results?: unknown };
      if (!Array.isArray(payload.results)) {
        throw new SearchError('invalid_response', 'Tavily 返回格式不正确：缺少 results 数组');
      }
      const maxResults = Math.max(1, Math.min(8, input.maxResults ?? 5));
      return {
        provider: 'tavily',
        results: payload.results
          .map((item) => mapItem(item as TavilyItem))
          .filter((item): item is WebSearchResult => item !== null)
          .slice(0, maxResults),
      };
    } catch (error) {
      if (error instanceof SearchError) throw error;
      if (linked.timedOut()) {
        throw new SearchError('unreachable', `Tavily 超时（${timeoutMs}ms）`);
      }
      if (signal?.aborted) throw error;
      throw new SearchError(
        'unreachable',
        `无法连接 Tavily：${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      linked.dispose();
    }
  }

  return {
    id: 'tavily',
    search: request,
    async testConnection() {
      try {
        await request({ query: 'ping', maxResults: 1 });
        return { ok: true, message: 'Tavily 搜索服务可用' };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}
