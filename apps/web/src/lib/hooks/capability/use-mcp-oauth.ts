'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { McpOAuthStartResult, McpOAuthStatuses } from '@wbfm/shared/types';
import { useVisibleQuery } from '@/lib/ui/panel-visibility';
import { apiDelete, apiGet, apiPost } from '@/lib/api/client';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';

/** v2.24：远程 MCP OAuth 状态（回调在独立浏览器完成，轮询刷新） */
export function useMcpOAuthStatuses() {
  return useVisibleQuery({
    queryKey: QUERY_KEYS.mcpOAuthStatuses,
    queryFn: () => apiGet<McpOAuthStatuses>(API.mcpOAuthStatuses),
    refetchInterval: 10_000,
  });
}

export function useMcpOAuthMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: QUERY_KEYS.mcpOAuthStatuses });
    void qc.invalidateQueries({ queryKey: QUERY_KEYS.mcpServers });
    void qc.invalidateQueries({ queryKey: QUERY_KEYS.mcpTools });
  };

  return {
    start: useMutation({
      mutationFn: (id: string) => apiPost<McpOAuthStartResult>(API.mcpServerOAuth(id)),
      onSuccess: invalidate,
    }),
    clear: useMutation({
      mutationFn: (id: string) => apiDelete<{ id: string }>(API.mcpServerOAuth(id)),
      onSuccess: invalidate,
    }),
  };
}

/** 打开授权页；Electron 会由主进程转交系统浏览器 */
export function openOAuthUrl(url: string): void {
  if (typeof window === 'undefined') return;
  window.open(url, '_blank', 'noopener,noreferrer');
}
