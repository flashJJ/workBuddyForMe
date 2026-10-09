'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Memory, MemoryKind, MemoryStatus } from '@wbfm/shared/types';
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
  return useQuery({
    queryKey: [...QUERY_KEYS.memories, filter],
    queryFn: () => apiGet<Memory[]>(`${API.memories}${toQueryString(filter)}`),
  });
}

export function useMemoryMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: QUERY_KEYS.memories });

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
      mutationFn: () => apiPost<{ removed: number }>(API.memoryClear, {}),
      onSuccess: invalidate,
    }),
  };
}
