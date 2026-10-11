'use client';

import { useQueries } from '@tanstack/react-query';
import type { ProviderModel } from '@wbfm/shared/types';
import { apiGet } from '@/lib/api/client';
import { API } from '@/lib/api/endpoints';
import { useProviders } from '@/lib/hooks/use-providers';

/** 跨供应商模型扁平选项（modelId 为全局唯一标识）；llm/agent 表单共用 */
export interface ModelOption {
  modelId: string;
  label: string;
}

export function useModelOptions(): ModelOption[] {
  const providers = useProviders();
  const ids = (providers.data ?? []).map((p) => p.id);
  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['models', id],
      queryFn: () => apiGet<ProviderModel[]>(API.providerModels(id)),
    })),
  });
  return (providers.data ?? []).flatMap((p, i) =>
    (results[i]?.data ?? []).map((m) => ({
      modelId: m.modelId,
      label: `${p.name} / ${m.displayName || m.modelId}`,
    })),
  );
}
