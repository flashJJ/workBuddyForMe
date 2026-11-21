'use client';

import * as React from 'react';
import { unwrapEnvelope, type ApiEnvelope } from '@wbfm/shared/api';
import { SEARCH_MIN_QUERY_LENGTH, type SearchDomain } from '@wbfm/shared/schemas';
import { withManagedHeaders } from '@/lib/api/client';
import { API } from '@/lib/api/endpoints';
import {
  GLOBAL_SEARCH_SCOPES,
  assembleGroups,
  isGlobalSearchScope,
  mapEventsToHits,
  searchKnowledge,
  type GlobalSearchEventScope,
  type RawSearchEvent,
} from './lib';
import type { GlobalSearchGroup, GlobalSearchHit } from './types';

const DEBOUNCE_MS = 300;
const ALL_DOMAINS: SearchDomain[] = [...GLOBAL_SEARCH_SCOPES, 'knowledge'];

interface SearchResults {
  groups: GlobalSearchGroup[];
  failedDomains: SearchDomain[];
}

async function searchOne(
  scope: GlobalSearchEventScope,
  query: string,
  signal: AbortSignal,
): Promise<GlobalSearchHit[]> {
  const response = await fetch(API.search(query, scope), withManagedHeaders({ signal }));
  const rows = unwrapEnvelope((await response.json()) as ApiEnvelope<RawSearchEvent[]>);
  return mapEventsToHits(scope, rows ?? []);
}

async function searchDomain(
  domain: SearchDomain,
  query: string,
  signal: AbortSignal,
): Promise<GlobalSearchHit[]> {
  if (domain === 'knowledge') return searchKnowledge(query, signal);
  if (isGlobalSearchScope(domain)) return searchOne(domain, query, signal);
  return [];
}

/**
 * v4.18：全局检索（仅本机 /api/search + 知识库文档列表）。
 * 300ms 防抖 + Abort；按域并发，单域失败不影响其他域；domain!=='all' 时只查当前域。
 */
export function useGlobalSearch(open: boolean, domain: SearchDomain | 'all' = 'all') {
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<SearchResults>({
    groups: [],
    failedDomains: [],
  });
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    const q = query.trim();
    const domains = domain === 'all' ? ALL_DOMAINS : [domain];
    if (!open || q.length < SEARCH_MIN_QUERY_LENGTH) {
      setResults({ groups: [], failedDomains: [] });
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      const settled = await Promise.allSettled(
        domains.map((item) => searchDomain(item, q, controller.signal)),
      );
      if (controller.signal.aborted) return;
      const { groups, failedDomains } = assembleGroups(domains, settled);
      setResults({ groups, failedDomains });
      setLoading(false);
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open, domain]);

  return {
    query,
    setQuery,
    groups: results.groups,
    failedDomains: results.failedDomains,
    loading,
  };
}
