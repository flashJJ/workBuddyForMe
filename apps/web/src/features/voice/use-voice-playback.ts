'use client';

import * as React from 'react';
import type { SsePayloadMap } from '@wbfm/shared';
import { AudioPlaybackQueue, type VoiceState } from './audio-playback-queue';
import { WebAudioPlayer } from './web-audio-player';

export interface VoicePlayback {
  /** 投喂一帧 voice_audio */
  enqueue: (frame: SsePayloadMap['voice_audio']) => void;
  /** 立即停止播放并清空队列（停止生成/急停/切换会话） */
  cancel: () => void;
  /** 当前语音状态（idle/speaking；listening/thinking 由别处驱动） */
  voiceState: VoiceState;
  speaking: boolean;
}

/** 语音播放：AudioContext + 单写者队列；卸载时自动清理 */
export function useVoicePlayback(): VoicePlayback {
  const [voiceState, setVoiceState] = React.useState<VoiceState>('idle');
  const queueRef = React.useRef<AudioPlaybackQueue | null>(null);

  if (!queueRef.current && typeof window !== 'undefined') {
    // 播放器构造不触碰 AudioContext（惰性），SSR/首渲安全
    queueRef.current = new AudioPlaybackQueue(new WebAudioPlayer(), (s) => setVoiceState(s));
  }

  React.useEffect(() => () => queueRef.current?.dispose(), []);

  const enqueue = React.useCallback((frame: SsePayloadMap['voice_audio']) => {
    queueRef.current?.enqueue(frame);
  }, []);
  const cancel = React.useCallback(() => queueRef.current?.cancel(), []);

  return { enqueue, cancel, voiceState, speaking: voiceState === 'speaking' };
}
