'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useVisibleQuery } from '@/lib/ui/panel-visibility';
import type { FlowScheduleView } from '@wbfm/shared/types';
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api/client';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';

/** GET /api/flows/:id/schedule 响应 */
export interface FlowScheduleDetail {
  schedule: FlowScheduleView | null;
}

export interface FlowScheduleSaveInput {
  cron: string;
  enabled: boolean;
  input?: Record<string, unknown>;
}

export interface FlowScheduleRunResult {
  runId: string | null;
  reason?: 'busy' | 'not_published';
}

export function useFlowSchedule(workflowId: string | null) {
  return useVisibleQuery({
    queryKey: workflowId ? QUERY_KEYS.flowSchedule(workflowId) : ['flow-schedule', 'disabled'],
    queryFn: () => apiGet<FlowScheduleDetail>(API.flowSchedule(workflowId!)),
    enabled: Boolean(workflowId),
  });
}

export function useFlowScheduleMutations(workflowId: string) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: QUERY_KEYS.flowSchedule(workflowId) });

  const save = useMutation({
    mutationFn: (body: FlowScheduleSaveInput) =>
      apiPut<FlowScheduleDetail>(API.flowSchedule(workflowId), body),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: () => apiDelete<{ removed: boolean }>(API.flowSchedule(workflowId)),
    onSuccess: invalidate,
  });
  const runNow = useMutation({
    mutationFn: () => apiPost<FlowScheduleRunResult>(API.flowScheduleRun(workflowId)),
    onSuccess: invalidate,
  });

  return { save, remove, runNow };
}
