'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { VoiceModelKind } from '@wbfm/voice';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';
import { apiPost } from '@/lib/api/client';
import { useVoiceSettings } from '../use-voice-settings';

export type ModelDownloadState = 'missing' | 'downloading' | 'ready' | 'error';

export interface ModelDownloadView {
  /** 磁盘文件齐备（以服务端 stat 为准） */
  ready: boolean;
  active: boolean;
  status: ModelDownloadState;
  bytesDone: number;
  bytesTotal: number;
  /** 0~1；total 未知时为 0 */
  ratio: number;
  error: string | null;
}

/** 语音模型下载动作 + 状态视图（状态源为 useVoiceSettings 的轮询查询） */
export function useVoiceModelDownloads() {
  const { modelStatus } = useVoiceSettings();
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.voiceModelStatus });

  const startMutation = useMutation({
    mutationFn: (kind: VoiceModelKind) =>
      apiPost(API.voiceModelDownload, { kind, action: 'start' }),
    onSuccess: invalidate,
  });
  const cancelMutation = useMutation({
    mutationFn: (kind: VoiceModelKind) =>
      apiPost(API.voiceModelDownload, { kind, action: 'cancel' }),
    onSuccess: invalidate,
  });

  const viewFor = React.useCallback(
    (kind: VoiceModelKind): ModelDownloadView => {
      const dl = modelStatus?.downloads[kind];
      const ready = kind === 'asr' ? !!modelStatus?.asrReady : !!modelStatus?.ttsReady;
      const bytesTotal = dl?.bytesTotal ?? 0;
      const bytesDone = dl?.bytesDone ?? 0;
      return {
        ready,
        active: dl?.active ?? false,
        status: dl?.status ?? 'missing',
        bytesDone,
        bytesTotal,
        ratio: bytesTotal > 0 ? Math.min(1, bytesDone / bytesTotal) : 0,
        error: dl?.error ?? null,
      };
    },
    [modelStatus],
  );

  return {
    viewFor,
    start: (kind: VoiceModelKind) => startMutation.mutate(kind),
    cancel: (kind: VoiceModelKind) => cancelMutation.mutate(kind),
    starting: startMutation.isPending,
  };
}
