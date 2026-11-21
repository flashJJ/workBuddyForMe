import type { SearchAction, SearchDomain } from '@wbfm/shared/schemas';

/** v4.18：全局检索结果（与 @wbfm/shared/schemas 契约一致） */
export interface GlobalSearchHit {
  domain: SearchDomain;
  id: string;
  title: string;
  snippet: string;
  timestamp: string | null;
  deepLink: string;
  action: SearchAction;
}

export interface GlobalSearchGroup {
  domain: SearchDomain;
  hits: GlobalSearchHit[];
}

export interface GlobalSearchState {
  query: string;
  groups: GlobalSearchGroup[];
  failedDomains: SearchDomain[];
  loading: boolean;
}
