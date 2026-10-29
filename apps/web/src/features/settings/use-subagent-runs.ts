'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SubagentProviderInfo, SubagentRunInput, SubagentRunView } from '@wbfm/shared/schemas';
import { apiGet, apiPost } from '@/lib/api/client';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';

/** v2.11 外部代理：提供方、运行记录与发起/取消 */
export function useSubagentProviders() {
  return useQuery({
    queryKey: QUERY_KEYS.subagentProviders,
    queryFn: () => apiGet<{ providers: SubagentProviderInfo[] }>(API.subagentProviders),
    refetchInterval: 10_000,
  });
}

export function useSubagentRuns(enabled: boolean) {
  return useQuery({
    queryKey: QUERY_KEYS.subagentRuns,
    queryFn: () => apiGet<SubagentRunView[]>(API.subagentRuns),
    enabled,
    // 运行状态由服务端异步推进（审批 → spawn → 终态），面板打开时短轮询
    refetchInterval: 3_000,
  });
}

export function useStartSubagentRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SubagentRunInput) => apiPost<SubagentRunView>(API.subagentRuns, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.subagentRuns });
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.approvals });
    },
  });
}

export function useCancelSubagentRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<SubagentRunView>(API.subagentRunCancel(id), {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.subagentRuns });
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.approvals });
    },
  });
}
