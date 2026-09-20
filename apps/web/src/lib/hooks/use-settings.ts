'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppSettings, ProviderModel } from '@wbfm/shared';
import { useProviders } from './use-providers';
import { apiGet, apiPut } from '@/lib/api/client';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';

export type SettingsUpdateBody = Partial<AppSettings>;

export function useSettings() {
  return useQuery({
    queryKey: QUERY_KEYS.settings,
    queryFn: () => apiGet<AppSettings>(API.settings),
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SettingsUpdateBody) => apiPut<AppSettings>(API.settings, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.settings }),
  });
}

/** 聚合各供应商下的模型（扁平列表，供默认模型/助手绑定选择） */
export function useAllModels() {
  const { data: providers } = useProviders();
  return useQuery({
    queryKey: QUERY_KEYS.modelsAll,
    queryFn: async () => {
      if (!providers) return [];
      const lists = await Promise.all(
        providers.map((provider) => apiGet<ProviderModel[]>(API.providerModels(provider.id))),
      );
      return lists.flat();
    },
    enabled: Boolean(providers),
  });
}
