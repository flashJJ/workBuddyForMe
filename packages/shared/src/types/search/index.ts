import type { SearchProviderKind } from '../../constants';

/** v2.17：联网搜索设置（settings JSON 持久化；P0 无 Key，先支持 SearXNG / mock） */
export interface SearchSettings {
  provider: SearchProviderKind;
  /** SearXNG 服务地址；provider=searxng 时必填 */
  endpoint: string;
  maxResults: number;
  timeoutMs: number;
  /** 自建 SearXNG 允许内网地址；默认 false */
  allowPrivateEndpoint: boolean;
}

export interface WebSearchInput {
  query: string;
  maxResults?: number;
  freshness?: 'day' | 'week' | 'month' | 'year';
  site?: string;
  locale?: string;
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
  publishedAt?: string;
}

export interface WebSearchResponse {
  provider: string;
  results: WebSearchResult[];
}

/** v2.24：需密钥搜索服务的脱敏状态（明文仅在服务端） */
export interface SearchCredentialStatus {
  hasKey: boolean;
  masked: string | null;
}

export interface SearchCredentialsView {
  brave: SearchCredentialStatus;
  tavily: SearchCredentialStatus;
}
