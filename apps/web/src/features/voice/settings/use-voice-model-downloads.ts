'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { VoiceModelKind } from '@wbfm/voice';
import type { VoiceTtsModel } from '@wbfm/shared';
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

/** 语音模型下载动作 + 状态视图（状态源为 useVoiceSettings 的轮询查询）。
 *  TTS 需显式传模型（melo/kokoro）；缺省取当前选中引擎。 */
export function useVoiceModelDownloads() {
  const { modelStatus } = useVoiceSettings();
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.voiceModelStatus });

  const startMutation = useMutation({
    mutationFn: (target: { kind: VoiceModelKind; ttsModel?: VoiceTtsModel }) =>
      apiPost(API.voiceModelDownload, {
        kind: target.kind,
        ...(target.kind === 'tts' && target.ttsModel
          ? { model: target.ttsModel }
          : {}),
        action: 'start',
      }),
    onSuccess: invalidate,
  });
  const cancelMutation = useMutation({
    mutationFn: (target: { kind: VoiceModelKind; ttsModel?: VoiceTtsModel }) =>
      apiPost(API.voiceModelDownload, {
        kind: target.kind,
        ...(target.kind === 'tts' && target.ttsModel
          ? { model: target.ttsModel }
          : {}),
        action: 'cancel',
      }),
    onSuccess: invalidate,
  });

  const viewFor = React.useCallback(
    (kind: VoiceModelKind, ttsModel?: VoiceTtsModel): ModelDownloadView => {
      if (kind === 'asr') {
        const dl = modelStatus?.downloads.asr;
        const bytesTotal = dl?.bytesTotal ?? modelStatus?.asrTotalBytes ?? 0;
        const bytesDone = dl?.bytesDone ?? 0;
        return {
          ready: !!modelStatus?.asrReady,
          active: dl?.active ?? false,
          status: dl?.status ?? 'missing',
          bytesDone,
          bytesTotal,
          ratio: bytesTotal > 0 ? Math.min(1, bytesDone / bytesTotal) : 0,
          error: dl?.error ?? null,
        };
      }
      const model = ttsModel ?? modelStatus?.activeTtsModel ?? 'kokoro';
      const dl =
        modelStatus?.downloads.ttsByModel?.[model] ??
        // 旧服务端无 ttsByModel 时回落当前选中模型的兼容字段
        (model === modelStatus?.activeTtsModel ? modelStatus?.downloads.tts : undefined);
      const fileInfo = modelStatus?.ttsModels.find((m) => m.model === model);
      const bytesTotal = dl?.bytesTotal ?? fileInfo?.totalBytes ?? 0;
      const bytesDone = dl?.bytesDone ?? 0;
      return {
        ready: fileInfo?.ready ?? (model === modelStatus?.activeTtsModel && !!modelStatus?.ttsReady),
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
    start: (kind: VoiceModelKind, ttsModel?: VoiceTtsModel) =>
      startMutation.mutate({ kind, ttsModel }),
    cancel: (kind: VoiceModelKind, ttsModel?: VoiceTtsModel) =>
      cancelMutation.mutate({ kind, ttsModel }),
    starting: startMutation.isPending,
  };
}
