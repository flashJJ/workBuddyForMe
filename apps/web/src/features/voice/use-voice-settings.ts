'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { VoiceSettings, VoiceSettingsUpdateInput } from '@wbfm/shared/schemas';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';
import { apiGet, apiPut } from '@/lib/api/client';

/** 语音设置 + 模型就绪/下载状态；下载进行中每秒轮询，结束自动停止 */
export function useVoiceSettings() {
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: QUERY_KEYS.voiceSettings,
    queryFn: () => apiGet<VoiceSettings>(API.voiceSettings),
    staleTime: 30_000,
  });

  const modelStatusQuery = useQuery({
    queryKey: QUERY_KEYS.voiceModelStatus,
    queryFn: () => apiGet<import('@wbfm/shared').VoiceModelStatus>(API.voiceModelStatus),
    // 任一模型下载中时 1s 轮询；全部空闲后停止（TTS 两套引擎分别看 ttsByModel）
    refetchInterval: (query) => {
      const downloads = query.state.data?.downloads;
      if (!downloads) return false;
      const ttsActive =
        downloads.tts.active ||
        Object.values(downloads.ttsByModel ?? {}).some((d) => d.active);
      return downloads.asr.active || ttsActive ? 1000 : false;
    },
  });

  const update = useMutation({
    mutationFn: (patch: VoiceSettingsUpdateInput) =>
      apiPut<VoiceSettings>(API.voiceSettings, patch as Record<string, unknown>),
    // 乐观写入：受控开关在离散事件同步 flush 时立即反映新值，避免被旧缓存复位
    onMutate: (patch) => {
      const previous = queryClient.getQueryData<VoiceSettings>(QUERY_KEYS.voiceSettings);
      queryClient.setQueryData<VoiceSettings>(QUERY_KEYS.voiceSettings, (old) =>
        old ? { ...old, ...patch } : old,
      );
      return { previous };
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEYS.voiceSettings, context.previous);
      }
    },
    onSuccess: (next) => {
      queryClient.setQueryData(QUERY_KEYS.voiceSettings, next);
    },
  });

  const refreshModelStatus = () =>
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.voiceModelStatus });

  return {
    settings: settingsQuery.data ?? null,
    modelStatus: modelStatusQuery.data ?? null,
    isLoading: settingsQuery.isLoading,
    update: update.mutateAsync,
    refreshModelStatus,
  };
}
