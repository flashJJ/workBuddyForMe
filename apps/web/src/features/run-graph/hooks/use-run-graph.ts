'use client';

import { useQuery } from '@tanstack/react-query';
import type { RunGraphRootKind, RunGraphSnapshot } from '@wbfm/shared/types';
import { apiGet } from '@/lib/api/client';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';

/** v2.20 M2：过程图快照；打开期间轮询，避免第二套 SSE 聚合口径。 */
export function useRunGraph(kind: RunGraphRootKind, id: string | null, enabled = true) {
  return useQuery<RunGraphSnapshot>({
    queryKey: QUERY_KEYS.runGraph(kind, id ?? ''),
    queryFn: () =>
      apiGet<RunGraphSnapshot>(
        kind === 'meeting' ? API.meetingRunGraph(id!) : API.conversationRunGraph(id!),
      ),
    enabled: enabled && Boolean(id),
    refetchInterval: enabled ? 2000 : false,
    refetchIntervalInBackground: false,
    staleTime: 1000,
  });
}
