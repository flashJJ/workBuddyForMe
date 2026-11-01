'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DebugToolInfo, ToolResult } from '@wbfm/core/tools';
import { apiGet, apiPost } from '@/lib/api/client';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';

/** 调试台可用工具列表（内置 + 已连接 MCP） */
export function useToolDebugList() {
  return useQuery({
    queryKey: QUERY_KEYS.toolDebug,
    queryFn: () => apiGet<DebugToolInfo[]>(API.toolDebug),
  });
}

export interface ToolDebugExecuteRequest {
  name: string;
  args: unknown;
}

export function useToolDebugExecute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ToolDebugExecuteRequest) =>
      apiPost<ToolResult>(API.toolDebug, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.toolDebug });
    },
  });
}
