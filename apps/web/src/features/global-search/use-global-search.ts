'use client';

import * as React from 'react';
import { unwrapEnvelope, type ApiEnvelope } from '@wbfm/shared/api';
import { SEARCH_MIN_QUERY_LENGTH, type SearchDomain } from '@wbfm/shared/schemas';
import { withManagedHeaders } from '@/lib/api/client';
import { API } from '@/lib/api/endpoints';
import {
  GLOBAL_SEARCH_SCOPES,
  assembleGroups,
  mapEventsToHits,
  type GlobalSearchEventScope,
  type RawSearchEvent,
} from './map-events';
import type { GlobalSearchGroup, GlobalSearchHit } from './types';

const DEBOUNCE_MS = 300;

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

/**
 * v4.18：四域全局检索（仅本机 /api/search）。
 * 300ms 防抖 + Abort；四域并发，单域失败不影响其他域。
 */
export function useGlobalSearch(open: boolean) {
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<SearchResults>({
    groups: [],
    failedDomains: [],
  });
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    const q = query.trim();
    if (!open || q.length < SEARCH_MIN_QUERY_LENGTH) {
      setResults({ groups: [], failedDomains: [] });
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      const settled = await Promise.allSettled(
        GLOBAL_SEARCH_SCOPES.map((scope) => searchOne(scope, q, controller.signal)),
      );
      if (controller.signal.aborted) return;
      const { groups, failedDomains } = assembleGroups(GLOBAL_SEARCH_SCOPES, settled);
      setResults({ groups, failedDomains });
      setLoading(false);
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  return {
    query,
    setQuery,
    groups: results.groups,
    failedDomains: results.failedDomains,
    loading,
  };
}
