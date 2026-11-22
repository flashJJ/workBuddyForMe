'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useVisibleQuery } from '@/lib/ui/panel-visibility';
import type {
  Memory,
  MemoryConsolidateSummary,
  MemoryKind,
  MemoryLifecycleStats,
  MemoryStatus,
} from '@wbfm/shared/types';
import type { MemoryRecallTrace } from '@wbfm/core';
import type { MemoryListQuery } from '@wbfm/shared/schemas';
import { apiGet, apiPatch, apiPost, apiDelete } from '@/lib/api/client';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';

export interface MemoryCreateBody {
  kind: MemoryKind;
  content: string;
  importance: number;
}

export type MemoryUpdateBody = Partial<{
  kind: MemoryKind;
  content: string;
  importance: number;
  status: MemoryStatus;
  pinned: boolean;
  weight: 'up' | 'down';
  mergeIds: string[];
}>;

function toQueryString(filter: MemoryListQuery): string {
  const params = new URLSearchParams();
  if (filter.kind) params.set('kind', filter.kind);
  if (filter.status) params.set('status', filter.status);
  if (filter.search) params.set('search', filter.search);
  if (filter.from) params.set('from', filter.from);
  if (filter.to) params.set('to', filter.to);
  params.set('limit', String(filter.limit ?? 200));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function useMemories(filter: MemoryListQuery = { limit: 200 }) {
  return useVisibleQuery({
    queryKey: [...QUERY_KEYS.memories, filter],
    queryFn: () => apiGet<Memory[]>(`${API.memories}${toQueryString(filter)}`),
  });
}

export function useMemoryStats() {
  return useVisibleQuery({
    queryKey: QUERY_KEYS.memoryStats,
    queryFn: () => apiGet<MemoryLifecycleStats>(API.memoryStats),
  });
}

/** v4.21：最近召回解释轨迹（只读元数据） */
export function useMemoryExplain() {
  return useVisibleQuery({
    queryKey: QUERY_KEYS.memoryExplain,
    queryFn: () => apiGet<{ traces: MemoryRecallTrace[] }>(API.memoryExplain),
  });
}

export function useMemoryConsolidate() {  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<MemoryConsolidateSummary>(API.memoryConsolidate, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.memories });
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.memoryStats });
    },
  });
}

export function useMemoryMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: QUERY_KEYS.memories });
    void qc.invalidateQueries({ queryKey: QUERY_KEYS.memoryStats });
    void qc.invalidateQueries({ queryKey: QUERY_KEYS.memoryExplain });
  };

  return {
    create: useMutation({
      mutationFn: (body: MemoryCreateBody) => apiPost<Memory>(API.memories, body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: MemoryUpdateBody }) =>
        apiPatch<Memory>(API.memory(id), body),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => apiDelete<{ id: string; deleted: boolean }>(API.memory(id)),
      onSuccess: invalidate,
    }),
    clear: useMutation({
      mutationFn: (input: { status?: MemoryStatus } = {}) =>
        apiPost<{ removed: number }>(
          API.memoryClear,
          input.status ? { status: input.status } : {},
        ),
      onSuccess: () => {
        invalidate();
        void qc.invalidateQueries({ queryKey: QUERY_KEYS.memoryStats });
      },
    }),
  };
}
