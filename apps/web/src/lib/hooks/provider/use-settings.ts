'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppSettings, ProviderModel } from '@wbfm/shared/types';
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
  // queryKey 随供应商集合变化：新增/删除供应商后自动重新聚合。
  // （key 恒定则不会重拉——向导里新建 demo 供应商后，列表页拿不到新模型，只能靠整页刷新兜底）
  const providerIds = (providers ?? []).map((provider) => provider.id).join(',');
  return useQuery({
    queryKey: [...QUERY_KEYS.modelsAll, providerIds],
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
