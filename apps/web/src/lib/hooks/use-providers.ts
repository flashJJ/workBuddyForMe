'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DiscoveredModel, Provider, ProviderModel } from '@wbfm/shared/types';
import type { ModelCapability } from '@wbfm/shared/constants';
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
    // v2.5：允许显式传入 providerId，避免「刚 setProvider 后同一渲染帧内 mutateAsync」
    // 仍拿到旧闭包 null 而请求 /providers/null；同时把空响应归一化为 []。
    mutationFn: async (overrideId?: string) => {
      const id = overrideId ?? providerId;
      if (!id) return [] as DiscoveredModel[];
      // v0.5：返回模型发现项（含自动探测的上下文长度）
      const models = await apiGet<DiscoveredModel[]>(`${API.providerModels(id)}?remote=1`);
      await qc.invalidateQueries({ queryKey: QUERY_KEYS.modelsAll });
      return models ?? [];
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
