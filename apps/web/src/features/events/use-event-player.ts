'use client';

import * as React from 'react';
import type { ExpressionTag } from '@wbfm/shared/schemas';
import { withManagedHeaders } from '@/lib/api/client';
import { API } from '@/lib/api/endpoints';
import { getPetBridge } from '@/features/pet/pet-bridge';
import type { VoiceAudioFrame } from '@/features/voice/audio-playback-queue';
import { EventPlayer, type EventPlayerControllerLike, type EventPlayerView } from './event-player';
import { wavToVoiceFrame } from './tts-clip';

/** 事件台词复用的播放队列结构面（与 v1.6 单 AudioContext 队列同实例） */
export interface EventPlaybackBridge {
  enqueue(frame: VoiceAudioFrame): void;
  cancel(): void;
  waitDrained(signal?: AbortSignal): Promise<void>;
}

interface UseEventPlayerArgs {
  /** Live2dStage 回传的控制器（摸头/事件共用同一实例） */
  controllerRef: React.MutableRefObject<EventPlayerControllerLike | null>;
  /** 情绪基线表情（release 时交还控制权） */
  baselineExpression: ExpressionTag;
  /** event.* 台词解析（M3 词典落地后即真实文案；缺键 i18n 回退键名） */
  resolveLine: (lineKey: string) => string;
  /** v1.6 播放队列；形象栏挂载期间必然存在，类型上保留 null 防御 */
  playback: EventPlaybackBridge | null;
  /** 全局朗读开关 */
  ttsEnabled: boolean;
  /** TTS 模型就绪（未就绪静默降级纯气泡） */
  ttsReady: boolean;
}

interface UseEventPlayerResult {
  /** 播放器实例（M3 director 把它作为 EventEffectSink 注入 runner） */
  playerRef: React.MutableRefObject<EventPlayer | null>;
  view: EventPlayerView;
}

const INITIAL_VIEW: EventPlayerView = { playing: false, subtitle: null, fx: [] };

/** 单句合成请求体台词上限（与设置页试听口径一致） */
const TTS_TEXT_MAX = 200;

/**
 * v1.7 事件播放器接线（M2）：
 * - EventPlayer 在 effect 内创建（StrictMode 挂载→清理→重挂拿到全新实例）；
 * - 全部易变依赖经 argsRef 读取，播放器实例终身稳定；
 * - 出声走 /api/voice/tts 单句合成 → 同一 AudioPlaybackQueue（口型/桌宠电平自动复用）；
 * - 桌宠表现经既有 pet 桥中继；无桥环境静默。
 */
export function useEventPlayer({
  controllerRef,
  baselineExpression,
  resolveLine,
  playback,
  ttsEnabled,
  ttsReady,
}: UseEventPlayerArgs): UseEventPlayerResult {
  const playerRef = React.useRef<EventPlayer | null>(null);
  const [view, setView] = React.useState<EventPlayerView>(INITIAL_VIEW);
  const petBridge = React.useMemo(() => getPetBridge(), []);

  const argsRef = React.useRef({
    controllerRef,
    baselineExpression,
    resolveLine,
    playback,
    canSpeak: ttsEnabled && ttsReady && Boolean(playback),
  });
  argsRef.current = {
    controllerRef,
    baselineExpression,
    resolveLine,
    playback,
    canSpeak: ttsEnabled && ttsReady && Boolean(playback),
  };
  const petRef = React.useRef(petBridge);
  petRef.current = petBridge;

  React.useEffect(() => {
    /**
     * 单句合成 → 入唯一播放队列 → 等排空。
     * abort 时同步 cancel 队列（事件让出 TTS 锁，CONV 音频随后独占）。
     */
    const speak = async (text: string, signal: AbortSignal): Promise<void> => {
      const queue = argsRef.current.playback;
      if (!queue || signal.aborted) return;
      signal.addEventListener('abort', () => queue.cancel(), { once: true });
      const response = await fetch(
        API.voiceTts,
        withManagedHeaders({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text: text.slice(0, TTS_TEXT_MAX) }),
          signal,
        }),
      );
      if (signal.aborted) return;
      if (!response.ok) throw new Error(`tts ${response.status}`);
      const buffer = await response.arrayBuffer();
      const frame = wavToVoiceFrame(buffer, text);
      if (!frame) throw new Error('tts-invalid-wav');
      queue.enqueue(frame);
      await queue.waitDrained(signal);
    };

    const player = new EventPlayer({
      getController: () => argsRef.current.controllerRef.current,
      resolveLine: (key) => argsRef.current.resolveLine(key),
      get speech() {
        const args = argsRef.current;
        return args.canSpeak && args.playback ? { speak } : null;
      },
      restoreBaseline: () => {
        const args = argsRef.current;
        void args.controllerRef.current?.setExpression(args.baselineExpression);
        petRef.current?.relayPerformance({
          kind: 'expression',
          tag: args.baselineExpression,
        });
      },
      relayPet: (event) => petRef.current?.relayPerformance(event),
      onWarn: (code, detail) => {
        // 结构化警告：演出永不因副作用失败而中断
        console.warn(`[event-player] ${code}`, detail ?? '');
      },
    });
    playerRef.current = player;
    const unsubscribe = player.subscribe(() => setView(player.getSnapshot()));
    setView(player.getSnapshot());
    return () => {
      unsubscribe();
      player.dispose();
      playerRef.current = null;
    };
  }, []);

  return { playerRef, view };
}
