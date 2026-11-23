'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  FlowRunBatchReplayResult,
  FlowRunError,
  FlowRuntimeHealthView,
} from '@wbfm/shared/types';
import { useVisibleQuery } from '@/lib/ui/panel-visibility';
import { apiGet, apiPost, apiPut } from '@/lib/api/client';
import { API } from '@/lib/api/endpoints';

export interface FlowRunRetentionPolicy {
  enabled: boolean;
  successDays: number;
  failureDays: number;
  maxPerWorkflow: number;
}

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
  error?: FlowRunError;
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
  return useVisibleQuery({
    queryKey: ['flow-runs-center', filter.trigger ?? '', filter.status ?? '', filter.workflowId ?? ''],
    queryFn: () => apiGet<{ runs: FlowRunSummary[] }>(`${API.flowRunsCenter}${qs ? `?${qs}` : ''}`),
    // 运行中心打开期间低频轮询，让 queued/running/interrupted 行自动收敛
    refetchInterval: 3000,
  });
}

export function useReplayRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { runId: string; nodeId?: string; mode?: 'snapshot' | 'latest' }) =>
      apiPost<{ runId: string; parentRunId: string }>(API.flowRunReplay(params.runId), {
        ...(params.nodeId ? { nodeId: params.nodeId } : {}),
        ...(params.mode ? { mode: params.mode } : {}),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['flow-runs-center'] });
    },
  });
}

/** v5.0：多选批量重放（≤20） */
export function useReplayRunsBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      runIds: string[];
      mode?: 'snapshot' | 'latest';
      nodeMode?: 'whole' | 'failed_node';
    }) => apiPost<FlowRunBatchReplayResult>(API.flowRunsReplayBatch, params),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['flow-runs-center'] });
    },
  });
}

/** v5.0：调度/文件/Webhook/补偿/保留健康 */
export function useFlowRunsHealth() {
  return useVisibleQuery({
    queryKey: ['flow-runs-health'],
    queryFn: () => apiGet<FlowRuntimeHealthView>(API.flowRunsHealth),
    refetchInterval: 10_000,
  });
}

export function useFlowRunRetention() {
  return useVisibleQuery({
    queryKey: ['flow-run-retention'],
    queryFn: () => apiGet<FlowRunRetentionPolicy>(API.flowRunsRetention),
  });
}

export function useUpdateFlowRunRetention() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (policy: FlowRunRetentionPolicy) =>
      apiPut<FlowRunRetentionPolicy>(API.flowRunsRetention, policy),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['flow-run-retention'] });
      void qc.invalidateQueries({ queryKey: ['flow-runs-health'] });
    },
  });
}

export function useFlowRunsCleanup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dryRun: boolean) =>
      apiPost<{ removed: number; scanned: number; dryRun: boolean }>(API.flowRunsCleanup, {
        dryRun,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['flow-runs-health'] });
      void qc.invalidateQueries({ queryKey: ['flow-runs-center'] });
    },
  });
}
