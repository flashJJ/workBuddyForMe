import { createSettingsRepository, type DatabaseInstance } from '@wbfm/database';
import { createSearchProvider, SearchError } from '@wbfm/ai';
import type { SearchSettings, WebSearchInput, WebSearchResponse } from '@wbfm/shared/types';
import { assertSafeUrlLiteral, resolveAndAssertHost, SsrfBlockedError } from '../../tools/ssrf-guard';
import { resolveSearchSettings } from './search-settings';

const SETTINGS_KEY = 'app-settings';

export interface SearchService {
  getSettings(): SearchSettings;
  search(input: WebSearchInput, signal?: AbortSignal): Promise<WebSearchResponse>;
  testConnection(): Promise<{ ok: boolean; message: string }>;
}

/**
 * v2.17：联网搜索服务。
 * - 只读取 settings JSON，不落库、不缓存；
 * - SearXNG endpoint 在发起请求前做协议与私网校验（自建实例可显式放行私网）；
 * - provider 构造与请求细节在 @wbfm/ai/search，core 只做治理与上下文。
 */
export function createSearchService({ db }: { db: DatabaseInstance }): SearchService {
  const settings = createSettingsRepository(db);

  const getSettings = (): SearchSettings => {
    const stored = settings.getJson(SETTINGS_KEY, {} as { searchSettings?: unknown });
    return resolveSearchSettings(stored.searchSettings);
  };

  async function assertEndpoint(current: SearchSettings): Promise<void> {
    if (current.provider === 'mock') return;
    if (current.provider === 'none') {
      throw new SearchError(
        'not_configured',
        '联网搜索未启用，请到设置 → 工具与权限 → 联网搜索选择搜索服务。',
      );
    }
    const endpoint = current.endpoint.trim();
    if (!endpoint) {
      throw new SearchError(
        'not_configured',
        '尚未配置 SearXNG 地址，请到设置 → 工具与权限 → 联网搜索填写。',
      );
    }
    let url: URL;
    try {
      url = new URL(endpoint);
    } catch {
      throw new SearchError('blocked', `搜索服务地址不合法：${endpoint}`);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new SearchError('blocked', '搜索服务地址仅支持 http/https');
    }
    if (!current.allowPrivateEndpoint) {
      if (url.protocol !== 'https:') {
        throw new SearchError('blocked', '公网搜索服务必须使用 https；自建 SearXNG 请显式允许内网地址');
      }
      try {
        assertSafeUrlLiteral(endpoint);
        await resolveAndAssertHost(url.hostname);
      } catch (error) {
        if (error instanceof SsrfBlockedError) {
          throw new SearchError('blocked', error.message);
        }
        throw error;
      }
    }
  }

  return {
    getSettings,

    async search(input, signal) {
      const current = getSettings();
      await assertEndpoint(current);
      return createSearchProvider(current).search(input, signal);
    },

    async testConnection() {
      try {
        const current = getSettings();
        await assertEndpoint(current);
        return await createSearchProvider(current).testConnection();
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}
