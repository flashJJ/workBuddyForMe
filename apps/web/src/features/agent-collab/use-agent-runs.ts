'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AgentHandoffView, AgentRunView } from '@wbfm/shared/schemas';
import { apiGet, apiPost } from '@/lib/api/client';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';

/** v1.4：协作运行列表（任务中心「协作任务」；可按会话过滤） */
export function useAgentRuns(conversationId?: string) {
  return useQuery({
    queryKey: conversationId
      ? QUERY_KEYS.agentRunsByConversation(conversationId)
      : QUERY_KEYS.agentRuns,
    queryFn: () =>
      apiGet<AgentRunView[]>(
        conversationId ? `${API.agentRuns}?conversationId=${encodeURIComponent(conversationId)}` : API.agentRuns,
      ),
    staleTime: 5_000,
  });
}

export interface AgentRunDetail {
  run: AgentRunView;
  handoffs: AgentHandoffView[];
}

export function useAgentRun(id: string | null) {
  return useQuery({
    queryKey: id ? QUERY_KEYS.agentRun(id) : ['agent-run', 'disabled'],
    queryFn: () => apiGet<AgentRunDetail>(API.agentRun(id!)),
    enabled: !!id,
  });
}

export function useAgentRunMutations() {
  const qc = useQueryClient();
  return {
    cancel: useMutation({
      mutationFn: (id: string) => apiPost<{ ok: boolean }>(API.agentRunCancel(id), {}),
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: QUERY_KEYS.agentRuns });
      },
    }),
    /** v4.7 P1：只读计划预览决策（批准/拒绝） */
    decidePlan: useMutation({
      mutationFn: (input: { id: string; decision: 'approve' | 'reject'; note?: string }) =>
        apiPost<{ id: string; decision: string }>(API.agentRunPlan(input.id), {
          decision: input.decision,
          ...(input.note ? { note: input.note } : {}),
        }),
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: QUERY_KEYS.agentRuns });
      },
    }),
    /** v4.7 P1：从可续跑检查点继续（新建 run，服务端持有执行） */
    resume: useMutation({
      mutationFn: (id: string) => apiPost<AgentRunView>(API.agentRunResume(id), {}),
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: QUERY_KEYS.agentRuns });
      },
    }),
  };
}
