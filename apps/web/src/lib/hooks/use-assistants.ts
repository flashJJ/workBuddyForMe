'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Assistant, ToolName } from '@wbfm/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api/client';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';

export interface AssistantBody {
  name: string;
  emoji?: string | null;
  color?: string | null;
  systemPrompt: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number | null;
  modelId?: string | null;
  knowledgeBaseId?: string | null;
  enabledTools?: ToolName[];
  retrieveAlways?: boolean;
}

export function useAssistants() {
  return useQuery({
    queryKey: QUERY_KEYS.assistants,
    queryFn: () => apiGet<Assistant[]>(API.assistants),
  });
}

export function useAssistantMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: QUERY_KEYS.assistants });

  return {
    create: useMutation({
      mutationFn: (body: AssistantBody) => apiPost<Assistant>(API.assistants, body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: Partial<AssistantBody> }) =>
        apiPatch<Assistant>(API.assistant(id), body),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => apiDelete<{ id: string }>(API.assistant(id)),
      onSuccess: invalidate,
    }),
    reorder: useMutation({
      mutationFn: (orderedIds: string[]) =>
        apiPost<{ orderedIds: string[] }>(API.assistantReorder, { orderedIds }),
      onSuccess: invalidate,
    }),
  };
}
