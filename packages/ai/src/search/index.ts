import type { SearchSettings } from '@wbfm/shared/types';
import { createSearxngProvider } from './searxng';
import { createMockSearchProvider } from './mock';
import type { SearchProvider } from './types';
import { SearchError } from './types';

/** v2.17：按设置构造搜索 provider；none 或缺少 endpoint 时给出可执行错误 */
export function createSearchProvider(settings: SearchSettings): SearchProvider {
  switch (settings.provider) {
    case 'searxng': {
      if (!settings.endpoint.trim()) {
        throw new SearchError(
          'not_configured',
          '尚未配置 SearXNG 地址，请到设置 → 工具与权限 → 联网搜索填写。',
        );
      }
      return createSearxngProvider(settings.endpoint.trim(), settings.timeoutMs);
    }
    case 'mock':
      return createMockSearchProvider();
    default:
      throw new SearchError(
        'not_configured',
        '联网搜索未启用，请到设置 → 工具与权限 → 联网搜索选择搜索服务。',
      );
  }
}

export type { SearchProvider, SearchErrorReason } from './types';
export { SearchError } from './types';
