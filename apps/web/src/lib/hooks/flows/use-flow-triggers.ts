'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { FlowFileTriggerConfig, FlowTriggerView } from '@wbfm/shared/types';
import type { FlowTriggerCreateInput, FlowTriggerUpdateInput } from '@wbfm/shared/schemas';
import { useVisibleQuery } from '@/lib/ui/panel-visibility';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api/client';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';

/** GET /api/flows/:id/triggers 响应 */
export interface FlowTriggerListResult {
  triggers: FlowTriggerView[];
}

/** POST 响应：Webhook 的 secret 仅创建时返回一次 */
export interface FlowTriggerCreateResult {
  trigger: FlowTriggerView;
  secret?: string;
}

export function useFlowTriggers(workflowId: string | null) {
  return useVisibleQuery({
    queryKey: workflowId ? QUERY_KEYS.flowTriggers(workflowId) : ['flow-triggers', 'disabled'],
    queryFn: () => apiGet<FlowTriggerListResult>(API.flowTriggers(workflowId!)),
    enabled: Boolean(workflowId),
  });
}

export function useFlowTriggerMutations(workflowId: string) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: QUERY_KEYS.flowTriggers(workflowId) });

  const create = useMutation({
    mutationFn: (body: FlowTriggerCreateInput) =>
      apiPost<FlowTriggerCreateResult>(API.flowTriggers(workflowId), body),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: (params: { triggerId: string; patch: FlowTriggerUpdateInput }) =>
      apiPatch<{ trigger: FlowTriggerView }>(
        API.flowTrigger(workflowId, params.triggerId),
        params.patch,
      ),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (triggerId: string) =>
      apiDelete<{ removed: boolean }>(API.flowTrigger(workflowId, triggerId)),
    onSuccess: invalidate,
  });
  /** v4.26：轮换 Webhook Secret；新明文仅本次响应返回 */
  const rotate = useMutation({
    mutationFn: (triggerId: string) =>
      apiPost<FlowTriggerCreateResult>(API.flowTriggerRotate(workflowId, triggerId)),
    onSuccess: invalidate,
  });

  return { create, update, remove, rotate };
}

export type { FlowFileTriggerConfig };
