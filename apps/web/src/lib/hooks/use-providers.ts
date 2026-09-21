'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ModelCapability, Provider, ProviderModel } from '@wbfm/shared';
import { apiGet, apiPatch, apiPost, apiDelete } from '@/lib/api/client';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';

export interface ProviderCreateBody {
  name: string;
  protocol: string;
  baseUrl: string;
  apiKey?: string;
  enabled?: boolean;
}

export interface ProviderUpdateBody {
  name?: string;
  baseUrl?: string;
  apiKey?: string;
  enabled?: boolean;
  sortOrder?: number;
}

export interface ModelCreateBody {
  modelId: string;
  displayName?: string;
  capabilities: ModelCapability[];
  contextWindow?: number | null;
}

export function useProviders() {
  return useQuery({
    queryKey: QUERY_KEYS.providers,
    queryFn: () => apiGet<Provider[]>(API.providers),
  });
}

export function useProviderMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: QUERY_KEYS.providers });

  return {
    create: useMutation({
      mutationFn: (body: ProviderCreateBody) => apiPost<Provider>(API.providers, body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: ProviderUpdateBody }) =>
        apiPatch<Provider>(API.provider(id), body),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => apiDelete<{ id: string }>(API.provider(id)),
      onSuccess: invalidate,
    }),
    testConnection: useMutation({
      mutationFn: (id: string) => apiPost<{ ok: true }>(API.providerTest(id)),
    }),
  };
}

export function useProviderModels(providerId: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.models(providerId ?? '_'),
    queryFn: () => apiGet<ProviderModel[]>(API.providerModels(providerId!)),
    enabled: Boolean(providerId),
  });
}

export function useRemoteModels(providerId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const models = await apiGet<string[]>(`${API.providerModels(providerId!)}?remote=1`);
      await qc.invalidateQueries({ queryKey: QUERY_KEYS.modelsAll });
      return models;
    },
  });
}

export function useModelMutations() {
  const qc = useQueryClient();
  return {
    add: useMutation({
      mutationFn: ({ providerId, body }: { providerId: string; body: ModelCreateBody }) =>
        apiPost<ProviderModel>(API.providerModels(providerId), body),
      onSuccess: () => qc.invalidateQueries({ queryKey: ['models'] }),
    }),
    remove: useMutation({
      mutationFn: (modelId: string) => apiDelete<{ id: string }>(API.model(modelId)),
      onSuccess: () => qc.invalidateQueries({ queryKey: ['models'] }),
    }),
  };
}
