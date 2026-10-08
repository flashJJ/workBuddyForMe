'use client';

import * as React from 'react';
import type { VoiceAsrResponse, VoiceState } from '@wbfm/shared/schemas';
import { API } from '@/lib/api/endpoints';
import { apiUpload } from '@/lib/api/client';
import { useVadMonitor, type VadMonitorError } from './vad/use-vad-monitor';
import { AsrTurnTracker } from './vad/asr-turn-tracker';
import type { VadEvent, VadSensitivity } from './vad/vad-detector';
import type { VoicePlayback } from './use-voice-playback';
import { encodeWav16k } from './pcm-wav';

export interface HandsfreeVoiceOptions {
  /** ASR 模型已就绪（未就绪时禁止武装） */
  asrReady: boolean;
  /** inputMode='vad' 且 asrEnabled 时为 true */
  canArm: boolean;
  sensitivity: VadSensitivity;
  silenceMs: number;
  playback: VoicePlayback;
  /** 识别文本自动发送（进入会话） */
  onRecognizedSend: (text: string) => void;
  /** barge-in：中断当前流式回复（abort SSE） */
  onAbortTurn: () => void;
}

export interface HandsfreeVoice {
  /** 用户是否显式开启免手（实际采集还要满足 canArm/asrReady） */
  armed: boolean;
  toggle: () => void;
  /** 合并后的四态：播放态以队列为准，其余取本地监听/思考 */
  voiceState: VoiceState;
  /** 麦克风采集实时电平（0~1，armed 时约 10Hz 刷新；未武装恒 0） */
  micLevel: number;
  /** 采集管线阶段：off/starting/on（on 才表示 worklet 已真正启动） */
  monitorPhase: 'off' | 'starting' | 'on';
  monitorError: VadMonitorError | null;
  asrError: string | null;
}

type LocalState = 'idle' | 'listening' | 'thinking';

/**
 * M4 免手语音编排：VAD 段 → ASR（单飞+单槽排队+超时/stale 隔离）→ 自动发送；
 * speech-start 撞播放态即 barge-in（停播放 + abort 生成）。
 */
export function useHandsfreeVoice(options: HandsfreeVoiceOptions): HandsfreeVoice {
  const { asrReady, canArm, sensitivity, silenceMs, playback, onRecognizedSend, onAbortTurn } =
    options;

  const [armed, setArmed] = React.useState(false);
  const [local, setLocal] = React.useState<LocalState>('idle');
  const [asrError, setAsrError] = React.useState<string | null>(null);
  // 实时麦克风电平（0~1，约 10Hz 刷新，仅供免手监听调试/电平指示）
  const [micLevel, setMicLevel] = React.useState(0);
  const lastLevelFlushRef = React.useRef(0);

  const busyRef = React.useRef(false);
  const queuedRef = React.useRef<Float32Array | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const trackerRef = React.useRef<AsrTurnTracker | null>(null);
  if (!trackerRef.current) trackerRef.current = new AsrTurnTracker();

  // 最新回调/门控走 ref，段处理器只随监控生命周期建一次
  const cbRef = React.useRef({ onRecognizedSend, onAbortTurn, playback });
  cbRef.current = { onRecognizedSend, onAbortTurn, playback };

  const monitorEnabled = armed && canArm && asrReady;

  const recognize = React.useCallback(async (samples: Float32Array) => {
    if (busyRef.current) {
      // 单飞：识别中又结束一段，只保留最新一段
      queuedRef.current = samples;
      return;
    }
    busyRef.current = true;
    setAsrError(null);
    setLocal('thinking');

    const tracker = trackerRef.current!;
    const turnId = tracker.start(() => {
      // 20s 超时：放弃本段，回到聆听，绝不卡在 thinking
      busyRef.current = false;
      queuedRef.current = null;
      abortRef.current?.abort();
      abortRef.current = null;
      setLocal('listening');
    });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const wav = encodeWav16k(samples);
      const form = new FormData();
      form.append('file', new File([wav], 'speech.wav', { type: 'audio/wav' }));
      const result = await apiUpload<VoiceAsrResponse>(API.voiceAsr, form, {
        signal: controller.signal,
      });
      if (!tracker.finish(turnId)) return; // stale：迟到响应丢弃

      const text = result.text.trim();
      if (text) {
        setLocal('idle'); // 有 TTS 时 speaking 由播放队列驱动
        cbRef.current.onRecognizedSend(text);
      } else {
        setLocal('listening');
      }
    } catch (err) {
      if (tracker.finish(turnId)) {
        setLocal('listening');
        if (!controller.signal.aborted) {
          setAsrError(err instanceof Error ? err.message : '识别失败');
        }
      }
    } finally {
      if (tracker.isCurrent(turnId)) abortRef.current = null;
      busyRef.current = false;
      const queued = queuedRef.current;
      if (queued) {
        queuedRef.current = null;
        void recognize(queued);
      }
    }
  }, []);

  const handleVadEvent = React.useCallback(
    (event: VadEvent) => {
      if (event === 'speech-start') {
        // 助手正在播报/收尾：确认用户开口的同一帧执行 barge-in
        if (cbRef.current.playback.getGate().speaking) {
          cbRef.current.playback.cancel();
          cbRef.current.onAbortTurn();
        }
        setLocal('listening');
      }
    },
    [],
  );

  const monitor = useVadMonitor({
    enabled: monitorEnabled,
    sensitivity,
    silenceMs,
    getGate: () => cbRef.current.playback.getGate(),
    onSegment: (samples) => void recognize(samples),
    onVadEvent: handleVadEvent,
    // 约 100ms 刷新一次电平，避免 32ms 每帧重渲染
    onLevel: (rms) => {
      const now = performance.now();
      if (now - lastLevelFlushRef.current >= 100) {
        lastLevelFlushRef.current = now;
        setMicLevel(rms);
      }
    },
  });

  // 关闭武装/失去条件：作废轮次与在途识别，复位本地态
  React.useEffect(() => {
    if (!monitorEnabled) {
      trackerRef.current?.cancel();
      abortRef.current?.abort();
      abortRef.current = null;
      queuedRef.current = null;
      setLocal('idle');
      setMicLevel(0);
    }
  }, [monitorEnabled]);

  const toggle = React.useCallback(() => {
    setArmed((prev) => {
      if (prev) {
        // 关闭即彻底停止采集与任何在途识别
        trackerRef.current?.cancel();
        abortRef.current?.abort();
        queuedRef.current = null;
        setLocal('idle');
      }
      return !prev;
    });
  }, []);

  const voiceState: VoiceState = playback.speaking ? 'speaking' : local;

  return {
    armed,
    toggle,
    voiceState,
    /** 麦克风采集实时电平（0~1，armed 时约 10Hz 刷新；未武装恒 0） */
    micLevel,
    /** 采集管线阶段：off/starting/on（on 才表示 worklet 已真正启动） */
    monitorPhase: monitor.phase,
    monitorError: monitor.error,
    asrError,
  };
}
