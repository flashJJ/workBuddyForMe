'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DocumentRecord, KnowledgeBase } from '@wbfm/shared';
import { apiDelete, apiGet, apiPatch, apiPost, apiUpload } from '@/lib/api/client';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';

export interface KnowledgeBaseBody {
  name: string;
  description?: string;
  chunkSize?: number;
  chunkOverlap?: number;
}

export function useKnowledgeBases() {
  return useQuery({
    queryKey: QUERY_KEYS.knowledgeBases,
    queryFn: () => apiGet<KnowledgeBase[]>(API.knowledgeBases),
  });
}

export function useDocuments(kbId: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.documents(kbId ?? '_'),
    queryFn: () => apiGet<DocumentRecord[]>(API.documents(kbId!)),
    enabled: Boolean(kbId),
    refetchInterval: (query) =>
      query.state.data?.some((doc) => doc.status === 'pending' || doc.status === 'processing')
        ? 1500
        : false,
  });
}

export function useKnowledgeMutations() {
  const qc = useQueryClient();
  const invalidateKb = () => qc.invalidateQueries({ queryKey: QUERY_KEYS.knowledgeBases });

  return {
    create: useMutation({
      mutationFn: (body: KnowledgeBaseBody) => apiPost<KnowledgeBase>(API.knowledgeBases, body),
      onSuccess: invalidateKb,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: Partial<KnowledgeBaseBody> }) =>
        apiPatch<KnowledgeBase>(API.knowledgeBase(id), body),
      onSuccess: invalidateKb,
    }),
    remove: useMutation({
      mutationFn: (id: string) => apiDelete<{ id: string }>(API.knowledgeBase(id)),
      onSuccess: invalidateKb,
    }),
    uploadDocument: useMutation({
      mutationFn: ({ kbId, file }: { kbId: string; file: File }) => {
        const form = new FormData();
        form.append('file', file);
        return apiUpload<DocumentRecord>(API.documents(kbId), form);
      },
      onSuccess: (_data, variables) =>
        qc.invalidateQueries({ queryKey: QUERY_KEYS.documents(variables.kbId) }),
    }),
    deleteDocument: useMutation({
      mutationFn: (input: { kbId: string; documentId: string }) =>
        apiDelete<{ id: string }>(API.document(input.documentId)),
      onSuccess: (_data, variables) =>
        qc.invalidateQueries({ queryKey: QUERY_KEYS.documents(variables.kbId) }),
    }),
  };
}
