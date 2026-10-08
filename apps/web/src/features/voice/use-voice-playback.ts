'use client';

import * as React from 'react';
import type { SsePayloadMap } from '@wbfm/shared/api';
import { AudioPlaybackQueue, type VoiceState } from './audio-playback-queue';
import { WebAudioPlayer } from './web-audio-player';
import type { VadGate } from './vad/vad-detector';

/**
 * 停播后回声门控冷却时长：屏蔽扬声器/音频管线尾音。
 * 300ms 实测足以覆盖 WebAudio 排空与室内混响；另有播放态 ×2.2 阈值 +
 * 600ms 起始确认双保险防自激，冷却窗只承担「硬置零」职责故可取较短值。
 */
const PLAYBACK_COOLDOWN_MS = 300;

export interface VoicePlayback {
  /** 投喂一帧 voice_audio */
  enqueue: (frame: SsePayloadMap['voice_audio']) => void;
  /** 立即停止播放并清空队列（停止生成/急停/切换会话/barge-in） */
  cancel: () => void;
  /** 当前播放电平 RMS（Live2D 口型 rAF 轮询用） */
  getLevel: () => number;
  /** M4：VAD 回声门控快照（speaking 提阈值；停播冷却窗内静音） */
  getGate: () => VadGate;
  /** 当前语音状态（idle/speaking；listening/thinking 由别处驱动） */
  voiceState: VoiceState;
  speaking: boolean;
  /**
   * 订阅音频渲染线程电平（M4 桌宠中继用）：回调随音频图 tick，
   * 窗口隐藏后仍触发（rAF 会被节流）；返回取消订阅。
   */
  subscribeLevel: (sink: (level: number) => void) => () => void;
}

/** 语音播放：AudioContext + 单写者队列；卸载时自动清理 */
export function useVoicePlayback(): VoicePlayback {
  const [voiceState, setVoiceState] = React.useState<VoiceState>('idle');
  const queueRef = React.useRef<AudioPlaybackQueue | null>(null);
  // 门控读数在音频帧回调中被查询，必须用 ref 避免闭包过期
  const speakingRef = React.useRef(false);
  const lastIdleAtRef = React.useRef(0);
  // 电平订阅者（M4 桌宠）：音频渲染线程回调扇出，不走 React 渲染
  const levelSinksRef = React.useRef<Set<(level: number) => void>>(new Set());

  // 队列必须在 effect 内创建（而非渲染期单例）：StrictMode dev 下组件会经历
  // 挂载→清理→重挂，渲染期单例会被首次 cleanup 的 dispose() 永久标记为
  // disposed，重挂后所有 voice_audio 帧在 enqueue 入口被静默丢弃（有声源、无解码、
  // 无报错）。effect 内创建可让重挂周期拿到全新实例；播放器构造本身惰性，
  // 不触碰 AudioContext，SSR/首渲安全（enqueue 等均有 null 守卫）。
  React.useEffect(() => {
    const queue = new AudioPlaybackQueue(
      new WebAudioPlayer({
        onLevel: (level) => {
          for (const sink of levelSinksRef.current) sink(level);
        },
      }),
      (s) => {
        if (s === 'speaking') {
          speakingRef.current = true;
        } else if (s === 'idle') {
          // 记录播报结束时刻（含正常播完与 cancel），供 VAD 冷却窗判定
          if (speakingRef.current) lastIdleAtRef.current = Date.now();
          speakingRef.current = false;
        }
        setVoiceState(s);
      },
    );
    queueRef.current = queue;
    return () => {
      queue.dispose();
      queueRef.current = null;
    };
  }, []);

  const enqueue = React.useCallback((frame: SsePayloadMap['voice_audio']) => {
    queueRef.current?.enqueue(frame);
  }, []);
  const cancel = React.useCallback(() => queueRef.current?.cancel(), []);
  const getLevel = React.useCallback(() => queueRef.current?.getLevel() ?? 0, []);
  const getGate = React.useCallback(
    (): VadGate => ({
      speaking: speakingRef.current,
      inCooldown:
        !speakingRef.current &&
        lastIdleAtRef.current !== 0 &&
        Date.now() - lastIdleAtRef.current < PLAYBACK_COOLDOWN_MS,
    }),
    [],
  );
  const subscribeLevel = React.useCallback((sink: (level: number) => void) => {
    levelSinksRef.current.add(sink);
    return () => {
      levelSinksRef.current.delete(sink);
    };
  }, []);

  return {
    enqueue,
    cancel,
    getLevel,
    getGate,
    subscribeLevel,
    voiceState,
    speaking: voiceState === 'speaking',
  };
}
