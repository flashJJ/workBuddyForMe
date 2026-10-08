'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { McpServerInfo, McpToolInfo } from '@wbfm/shared/types';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api/client';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';

export interface McpServerCreateBody {
  transport: 'stdio';
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
}

export interface McpServerUpdateBody {
  transport: 'stdio';
  name?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
}

/** 服务器列表 + 连接状态（连接异步收敛，轮询刷新状态徽章） */
export function useMcpServers() {
  return useQuery({
    queryKey: QUERY_KEYS.mcpServers,
    queryFn: () => apiGet<McpServerInfo[]>(API.mcpServers),
    refetchInterval: 5000,
  });
}

/** 已连接服务器的工具清单（助手表单分组使用） */
export function useMcpTools() {
  return useQuery({
    queryKey: QUERY_KEYS.mcpTools,
    queryFn: () => apiGet<McpToolInfo[]>(API.mcpTools),
    refetchInterval: 15000,
  });
}

export function useMcpMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: QUERY_KEYS.mcpServers });
    void qc.invalidateQueries({ queryKey: QUERY_KEYS.mcpTools });
  };

  return {
    create: useMutation({
      mutationFn: (body: McpServerCreateBody) => apiPost<McpServerInfo>(API.mcpServers, body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: McpServerUpdateBody }) =>
        apiPatch<McpServerInfo>(API.mcpServer(id), body),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => apiDelete<{ id: string }>(API.mcpServer(id)),
      onSuccess: invalidate,
    }),
  };
}
