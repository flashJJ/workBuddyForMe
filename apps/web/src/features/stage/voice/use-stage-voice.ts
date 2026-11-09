'use client';

import * as React from 'react';
import { getAvatarSpeakerId } from '@wbfm/shared/schemas';
import { withManagedHeaders } from '@/lib/api/client';
import { API } from '@/lib/api/endpoints';
import { wavToVoiceFrame } from '@/features/events/ui';
import { useVoicePlayback } from '@/features/voice/runtime';

/** 单句合成上限（voiceTtsRequestSchema 的 2000 字上限内留余量） */
const TTS_TEXT_MAX = 1800;

export type StageSpeakResult = 'played' | 'failed' | 'canceled';

export interface StageVoice {
  /** 合成并播放一句台词；返回是否真的播完（模型缺失/网络失败为 failed） */
  speak: (text: string, avatarModelId: string) => Promise<StageSpeakResult>;
  stop: () => void;
  speaking: boolean;
  getLevel: () => number;
}

/**
 * 舞台台词语音：复用 /api/voice/tts 与唯一播放队列。
 * 与对话页不同，舞台没有 SSE 音频流，这里按整句合成后单段入队；
 * 口型由播放电平驱动，合成失败时回落到控制器里的正弦口型。
 */
export function useStageVoice(): StageVoice {
  const { enqueue, cancel, waitDrained, getLevel, speaking } = useVoicePlayback();
  const abortRef = React.useRef<AbortController | null>(null);

  const stop = React.useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    cancel();
  }, [cancel]);

  const speak = React.useCallback(
    async (text: string, avatarModelId: string): Promise<StageSpeakResult> => {
      stop();
      const clean = text.trim().slice(0, TTS_TEXT_MAX);
      if (!clean) return 'failed';
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const response = await fetch(
          API.voiceTts,
          withManagedHeaders({
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              text: clean,
              speakerId: getAvatarSpeakerId(avatarModelId),
            }),
            signal: controller.signal,
          }),
        );
        if (!response.ok) return controller.signal.aborted ? 'canceled' : 'failed';
        const frame = wavToVoiceFrame(await response.arrayBuffer(), clean);
        if (!frame) return 'failed';
        if (controller.signal.aborted) return 'canceled';
        enqueue(frame);
        await waitDrained(controller.signal);
        return 'played';
      } catch {
        return controller.signal.aborted ? 'canceled' : 'failed';
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [enqueue, stop, waitDrained],
  );

  React.useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  return { speak, stop, speaking, getLevel };
}
