'use client';


import { apiGet } from '@/lib/api/client';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';
import { useVisibleQuery } from '@/lib/ui/panel-visibility';

/**
 * v2.4 M1：本机 Ollama 提前探测（向导第 2 步进入即调用）。
 * 结果只用于「已装 Ollama 时本地来源置顶」；探测失败按未命中处理。
 */
export function useOllamaProbe() {
  return useVisibleQuery({
    queryKey: QUERY_KEYS.ollamaProbe,
    queryFn: () => apiGet<{ available: boolean }>(API.systemOllama),
    staleTime: Infinity,
    retry: false,
  });
}
