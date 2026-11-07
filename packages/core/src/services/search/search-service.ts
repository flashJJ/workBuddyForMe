import { createSettingsRepository, type DatabaseInstance } from '@wbfm/database';
import { createSearchProvider, SearchError } from '@wbfm/ai';
import type {
  SearchCredentialsView,
  SearchSettings,
  WebSearchInput,
  WebSearchResponse,
} from '@wbfm/shared/types';
import type { SearchKeyProvider } from '@wbfm/shared/constants';
import type { SecretCipher } from '../../secrets/cipher';
import { assertSafeUrlLiteral, resolveAndAssertHost, SsrfBlockedError } from '../../tools/ssrf-guard';
import { createSearchCredentialStore } from './search-credentials';
import { resolveSearchSettings } from './search-settings';

const SETTINGS_KEY = 'app-settings';

export interface SearchService {
  getSettings(): SearchSettings;
  getCredentials(): SearchCredentialsView;
  setCredential(provider: SearchKeyProvider, apiKey: string): void;
  clearCredential(provider: SearchKeyProvider): void;
  search(input: WebSearchInput, signal?: AbortSignal): Promise<WebSearchResponse>;
  testConnection(): Promise<{ ok: boolean; message: string }>;
}

function isKeyProvider(provider: SearchSettings['provider']): provider is SearchKeyProvider {
  return provider === 'brave' || provider === 'tavily';
}

/**
 * v2.17：联网搜索服务。
 * - 只读取 settings JSON，不落库、不缓存；
 * - SearXNG endpoint 在发起请求前做协议与私网校验（自建实例可显式放行私网）；
 * - Brave / Tavily 使用加密保存的 API Key；
 * - provider 构造与请求细节在 @wbfm/ai/search，core 只做治理与上下文。
 */
export function createSearchService({
  db,
  cipher,
}: {
  db: DatabaseInstance;
  cipher: SecretCipher;
}): SearchService {
  const settings = createSettingsRepository(db);
  const credentials = createSearchCredentialStore({ db, cipher });

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
    if (isKeyProvider(current.provider)) return;
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

  function providerFor(current: SearchSettings) {
    const apiKey = isKeyProvider(current.provider) ? credentials.get(current.provider) : null;
    return createSearchProvider(current, apiKey);
  }

  return {
    getSettings,
    getCredentials: () => credentials.view(),
    setCredential(provider, apiKey) {
      credentials.set(provider, apiKey);
    },
    clearCredential(provider) {
      credentials.clear(provider);
    },

    async search(input, signal) {
      const current = getSettings();
      await assertEndpoint(current);
      return providerFor(current).search(input, signal);
    },

    async testConnection() {
      try {
        const current = getSettings();
        await assertEndpoint(current);
        return await providerFor(current).testConnection();
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}
