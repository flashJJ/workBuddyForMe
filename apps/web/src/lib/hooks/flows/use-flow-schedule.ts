'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useVisibleQuery } from '@/lib/ui/panel-visibility';
import type { FlowScheduleView } from '@wbfm/shared/types';
import { apiDelete, apiGet, apiPost, apiPatch } from '@/lib/api/client';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';

/** GET /api/flows/:id/schedules 响应 */
export interface FlowScheduleList {
  schedules: FlowScheduleView[];
}

export interface FlowScheduleCreateInput {
  name?: string;
  cron: string;
  timezone: string;
  enabled?: boolean;
  input?: Record<string, unknown>;
}

export interface FlowScheduleUpdateInput {
  name?: string;
  cron?: string;
  timezone?: string;
  enabled?: boolean;
  input?: Record<string, unknown> | null;
}

export interface FlowScheduleRunResult {
  runId: string | null;
  reason?: 'busy' | 'not_published';
}

export function useFlowSchedules(workflowId: string | null) {
  return useVisibleQuery({
    queryKey: workflowId ? QUERY_KEYS.flowSchedule(workflowId) : ['flow-schedule', 'disabled'],
    queryFn: () => apiGet<FlowScheduleList>(API.flowSchedules(workflowId!)),
    enabled: Boolean(workflowId),
  });
}

export function useFlowScheduleMutations(workflowId: string) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: QUERY_KEYS.flowSchedule(workflowId) });

  const create = useMutation({
    mutationFn: (body: FlowScheduleCreateInput) =>
      apiPost<{ schedule: FlowScheduleView }>(API.flowSchedules(workflowId), body),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: (vars: { scheduleId: string; patch: FlowScheduleUpdateInput }) =>
      apiPatch<{ schedule: FlowScheduleView }>(
        API.flowSchedule(workflowId, vars.scheduleId),
        vars.patch,
      ),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (scheduleId: string) =>
      apiDelete<{ removed: boolean }>(API.flowSchedule(workflowId, scheduleId)),
    onSuccess: invalidate,
  });
  const runNow = useMutation({
    mutationFn: (scheduleId?: string) =>
      apiPost<FlowScheduleRunResult>(API.flowSchedulesRun(workflowId), {
        ...(scheduleId ? { scheduleId } : {}),
      }),
    onSuccess: invalidate,
  });

  return { create, update, remove, runNow };
}
