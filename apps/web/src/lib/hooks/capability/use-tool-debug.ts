'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useVisibleQuery } from '@/lib/ui/panel-visibility';
import type { ToolResult } from '@wbfm/core/tools';
import type { ToolDescriptor } from '@wbfm/shared/schemas';
import { apiGet, apiPost } from '@/lib/api/client';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';

/** 调试台可用工具列表（内置 + 已连接 MCP + 已发布流程） */
export function useToolDebugList() {
  return useVisibleQuery({
    queryKey: QUERY_KEYS.toolDebug,
    queryFn: () => apiGet<ToolDescriptor[]>(API.toolDebug),
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
