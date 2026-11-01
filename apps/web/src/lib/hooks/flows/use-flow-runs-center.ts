'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api/client';
import { API } from '@/lib/api/endpoints';

/** GET /api/flow-runs 行视图 */
export interface FlowRunSummary {
  runId: string;
  workflowId: string;
  workflowName: string;
  status: string;
  trigger: string;
  version: number;
  parentRunId: string | null;
  resumedFromNode: string | null;
  createdAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  replayNodeId: string | null;
  error?: { code: string; message: string; nodeId?: string };
}

export interface FlowRunsFilter {
  trigger?: string;
  status?: string;
  workflowId?: string;
}

export function useFlowRuns(filter: FlowRunsFilter) {
  const query = new URLSearchParams();
  if (filter.trigger) query.set('trigger', filter.trigger);
  if (filter.status) query.set('status', filter.status);
  if (filter.workflowId) query.set('workflowId', filter.workflowId);
  const qs = query.toString();
  return useQuery({
    queryKey: ['flow-runs-center', filter.trigger ?? '', filter.status ?? '', filter.workflowId ?? ''],
    queryFn: () => apiGet<{ runs: FlowRunSummary[] }>(`${API.flowRunsCenter}${qs ? `?${qs}` : ''}`),
    // 运行中心打开期间低频轮询，让 queued/running/interrupted 行自动收敛
    refetchInterval: 3000,
  });
}

export function useReplayRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { runId: string; nodeId?: string }) =>
      apiPost<{ runId: string; parentRunId: string }>(API.flowRunReplay(params.runId), {
        ...(params.nodeId ? { nodeId: params.nodeId } : {}),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['flow-runs-center'] });
    },
  });
}
