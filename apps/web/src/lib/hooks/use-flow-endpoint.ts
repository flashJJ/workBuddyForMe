'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FlowUnattendedPolicy, WorkflowEndpointView } from '@wbfm/shared/types';
import type { FlowDangerNode } from '@wbfm/core/serving';
import { apiGet, apiPost, apiPut } from '@/lib/api/client';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';

/** GET /api/flows/:id/endpoint 响应 */
export interface FlowEndpointDetail {
  endpoint: WorkflowEndpointView | null;
  dangerNodes: FlowDangerNode[];
}

export interface FlowEndpointConfigInput {
  httpEnabled: boolean;
  mcpEnabled: boolean;
  syncTimeoutMs: number;
  rateLimitPerMin: number;
  policy?: FlowUnattendedPolicy;
}

export interface FlowEndpointSaveResult {
  endpoint: WorkflowEndpointView;
  /** 首次建行时一次性返回的明文密钥 */
  plaintextKey?: string;
}

export function useFlowEndpoint(workflowId: string | null) {
  return useQuery({
    queryKey: workflowId ? QUERY_KEYS.flowEndpoint(workflowId) : ['flow-endpoint', 'disabled'],
    queryFn: () => apiGet<FlowEndpointDetail>(API.flowEndpoint(workflowId!)),
    enabled: Boolean(workflowId),
  });
}

export function useFlowEndpointMutations(workflowId: string) {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: QUERY_KEYS.flowEndpoint(workflowId) });

  const save = useMutation({
    mutationFn: (body: FlowEndpointConfigInput) =>
      apiPut<FlowEndpointSaveResult>(API.flowEndpoint(workflowId), body),
    onSuccess: invalidate,
  });

  const rotate = useMutation({
    mutationFn: () => apiPost<FlowEndpointSaveResult>(API.flowEndpointRotate(workflowId)),
    onSuccess: invalidate,
  });

  return { save, rotate };
}
