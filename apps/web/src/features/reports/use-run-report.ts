'use client';

import { useQuery } from '@tanstack/react-query';
import type { RunEvidenceQuery, RunEvidenceReport } from '@wbfm/shared/schemas';
import { apiGet } from '@/lib/api/client';
import { API } from '@/lib/api/endpoints';

export interface RunReportFilter {
  from: string;
  to: string;
  chain: RunEvidenceQuery['chain'];
}

export function runReportQueryString(filter: RunReportFilter, format: 'json' | 'markdown' | 'csv' = 'json') {
  return new URLSearchParams({
    from: filter.from,
    to: filter.to,
    chain: filter.chain,
    format,
  }).toString();
}

/** v2.6 M5：运行证据汇总查询（时间窗 + 链路） */
export function useRunReport(filter: RunReportFilter) {
  return useQuery({
    queryKey: ['run-evidence', filter],
    queryFn: () =>
      apiGet<RunEvidenceReport>(`${API.runEvidence}?${runReportQueryString(filter)}`),
    enabled: Boolean(filter.from && filter.to),
  });
}
