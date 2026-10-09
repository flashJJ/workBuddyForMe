'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ToolPermission } from '@wbfm/shared/types';
import { apiDelete, apiGet } from '@/lib/api/client';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';

/** 权限列表（设置页管理） */
export function useToolPermissions(toolName?: string) {
  return useQuery({
    queryKey: QUERY_KEYS.toolPermissions,
    queryFn: () => apiGet<ToolPermission[]>(API.toolPermissions + (toolName ? `?toolName=${encodeURIComponent(toolName)}` : '')),
  });
}

export function useToolPermissionMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: QUERY_KEYS.toolPermissions });
  };

  return {
    revoke: useMutation({
      mutationFn: (id: string) => apiDelete<{ id: string }>(API.toolPermission(id)),
      onSuccess: invalidate,
    }),
  };
}
