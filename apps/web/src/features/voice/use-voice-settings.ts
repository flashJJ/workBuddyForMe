'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  VoiceModelStatus,
  VoiceSettings,
  VoiceSettingsUpdateInput,
} from '@wbfm/shared';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';
import { apiGet, apiPut } from '@/lib/api/client';

/** 语音设置 + 模型就绪状态（M1 只消费 ttsEnabled / ttsReady） */
export function useVoiceSettings() {
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: QUERY_KEYS.voiceSettings,
    queryFn: () => apiGet<{ data: VoiceSettings }>(API.voiceSettings).then((r) => r.data),
    staleTime: 30_000,
  });

  const modelStatusQuery = useQuery({
    queryKey: QUERY_KEYS.voiceModelStatus,
    queryFn: () =>
      apiGet<{ data: VoiceModelStatus & { downloads: unknown } }>(API.voiceModelStatus).then(
        (r) => r.data,
      ),
    // 下载期间由调用方主动轮询/失效；默认不频繁拉
    refetchInterval: false,
  });

  const update = useMutation({
    mutationFn: (patch: VoiceSettingsUpdateInput) =>
      apiPut<{ data: VoiceSettings }>(API.voiceSettings, patch as Record<string, unknown>).then(
        (r) => r.data,
      ),
    onSuccess: (next) => {
      queryClient.setQueryData<{ data: VoiceSettings }>(['voice-settings'], { data: next });
    },
  });

  const refreshModelStatus = () => queryClient.invalidateQueries({ queryKey: ['voice-model-status'] });

  return {
    settings: settingsQuery.data ?? null,
    modelStatus: modelStatusQuery.data ?? null,
    isLoading: settingsQuery.isLoading,
    update: update.mutateAsync,
    refreshModelStatus,
  };
}
