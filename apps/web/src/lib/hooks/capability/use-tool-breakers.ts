'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useVisibleQuery } from '@/lib/ui/panel-visibility';
import type { ToolBreakerSnapshot } from '@wbfm/core/tools';
import { apiGet, apiPost } from '@/lib/api/client';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';

/** 熔断中工具列表（设置页管理） */
export function useToolBreakers() {
  return useVisibleQuery({
    queryKey: QUERY_KEYS.toolBreakers,
    queryFn: () => apiGet<ToolBreakerSnapshot[]>(API.toolBreakers),
  });
}

export function useToolBreakerMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: QUERY_KEYS.toolBreakers });
  };

  return {
    reset: useMutation({
      mutationFn: (name: string) => apiPost<{ name: string; ok: boolean }>(API.toolBreakers, { name }),
      onSuccess: invalidate,
    }),
  };
}
