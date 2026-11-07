import type { WebSearchInput, WebSearchResponse, WebSearchResult } from '@wbfm/shared/types';
import { withTimeout } from '../http/timeout-signal';
import type { SearchProvider } from './types';
import { SearchError } from './types';

const ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';

interface BraveItem {
  title?: unknown;
  url?: unknown;
  description?: unknown;
  age?: unknown;
}

function statusError(status: number): SearchError {
  if (status === 401 || status === 403) {
    return new SearchError('auth_failed', 'Brave 拒绝请求：API Key 无效或无权限', status);
  }
  if (status === 429) return new SearchError('rate_limited', 'Brave 限流（HTTP 429）', status);
  return new SearchError('unreachable', `Brave 请求失败（HTTP ${status}）`, status);
}

function mapItem(item: BraveItem): WebSearchResult | null {
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
    snippet: typeof item.description === 'string' ? item.description.trim() : '',
    source: host,
  };
  if (typeof item.age === 'string' && item.age) result.publishedAt = item.age;
  return result;
}

/** v2.24：Brave Web Search 适配器（X-Subscription-Token） */
export function createBraveProvider(apiKey: string, timeoutMs: number): SearchProvider {
  async function request(input: WebSearchInput, signal?: AbortSignal): Promise<WebSearchResponse> {
    const linked = withTimeout(signal, timeoutMs);
    try {
      const url = new URL(ENDPOINT);
      url.searchParams.set('q', input.query);
      url.searchParams.set('count', String(Math.max(1, Math.min(8, input.maxResults ?? 5))));
      if (input.locale) url.searchParams.set('search_lang', input.locale);
      const response = await fetch(url.toString(), {
        headers: {
          Accept: 'application/json',
          'X-Subscription-Token': apiKey,
        },
        signal: linked.signal,
      });
      if (!response.ok) {
        await response.text().catch(() => '');
        throw statusError(response.status);
      }
      const payload = (await response.json()) as { web?: { results?: unknown } };
      const rawResults = payload.web?.results;
      if (!Array.isArray(rawResults)) {
        throw new SearchError('invalid_response', 'Brave 返回格式不正确：缺少 web.results 数组');
      }
      const maxResults = Math.max(1, Math.min(8, input.maxResults ?? 5));
      return {
        provider: 'brave',
        results: rawResults
          .map((item) => mapItem(item as BraveItem))
          .filter((item): item is WebSearchResult => item !== null)
          .slice(0, maxResults),
      };
    } catch (error) {
      if (error instanceof SearchError) throw error;
      if (linked.timedOut()) {
        throw new SearchError('unreachable', `Brave 超时（${timeoutMs}ms）`);
      }
      if (signal?.aborted) throw error;
      throw new SearchError(
        'unreachable',
        `无法连接 Brave：${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      linked.dispose();
    }
  }

  return {
    id: 'brave',
    search: request,
    async testConnection() {
      try {
        await request({ query: 'ping', maxResults: 1 });
        return { ok: true, message: 'Brave 搜索服务可用' };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}
