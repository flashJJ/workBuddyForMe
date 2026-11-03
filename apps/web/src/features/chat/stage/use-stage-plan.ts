'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { StagePlan } from '@wbfm/shared/types';
import type { StagePlanPrepareResult, StagePlanSaveResult } from '@wbfm/shared/schemas';
import { apiGet, apiPost, apiPut } from '@/lib/api/client';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';

/** v2.20 M5：会话阶段计划读取/保存/载入任务；保存后同步会话列表里的 modelId。 */
export function useStagePlan(conversationId: string | null) {
  const qc = useQueryClient();
  const enabled = Boolean(conversationId);
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: QUERY_KEYS.stagePlan(conversationId ?? '') });
    void qc.invalidateQueries({ queryKey: QUERY_KEYS.conversations });
  };

  const query = useQuery<{ plan: StagePlan | null }>({
    queryKey: QUERY_KEYS.stagePlan(conversationId ?? ''),
    queryFn: () => apiGet<{ plan: StagePlan | null }>(API.stagePlan(conversationId!)),
    enabled,
    staleTime: 5000,
  });

  const save = useMutation({
    mutationFn: (plan: StagePlan) =>
      apiPut<StagePlanSaveResult>(API.stagePlan(conversationId!), plan),
    onSuccess: invalidate,
  });

  const prepare = useMutation({
    mutationFn: (stepIndex: number) =>
      apiPost<StagePlanPrepareResult>(API.stagePlanPrepare(conversationId!), { stepIndex }),
  });

  return {
    plan: query.data?.plan ?? null,
    isLoading: query.isLoading,
    save,
    prepare,
  };
}
