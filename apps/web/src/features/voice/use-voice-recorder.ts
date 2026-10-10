'use client';

import * as React from 'react';
import type { VoiceAsrResponse } from '@wbfm/shared/schemas';
import { API } from '@/lib/api/endpoints';
import { apiUpload } from '@/lib/api/client';
import { useI18n } from '@/lib/i18n/use-i18n';
import { downsampleTo16k, encodeWav16k, rms } from './pcm-wav';

export type RecorderState = 'idle' | 'requesting' | 'recording' | 'recognizing';

export interface RecorderError {
  code: 'permission_denied' | 'no_device' | 'too_short' | 'network' | 'unknown';
  message: string;
}

export interface VoiceRecorder {
  state: RecorderState;
  /** 0~1 录音电平（节流回调驱动 UI） */
  level: number;
  error: RecorderError | null;
  start: () => Promise<void>;
  /** 停止录音并识别；空语音返回空串（调用方不发消息） */
  stopAndRecognize: () => Promise<string>;
  /** 中途取消（不识别） */
  cancel: () => void;
  clearError: () => void;
}

const MIN_AUDIO_MS = 300;

/**
 * 按住说话（PTT）录音 hook：
 * getUserMedia(单声道) → AudioContext + ScriptProcessor 采集
 * → 停止时降采样 16k → WAV → POST /api/voice/asr。
 *
 * v1.0 用 ScriptProcessor（免独立 worklet 资源服务，兼容性好）；
 * 采样在渲染线程，语音短帧足够。
 */
export function useVoiceRecorder(): VoiceRecorder {
  const { t } = useI18n();
  const [state, setState] = React.useState<RecorderState>('idle');
  const [level, setLevel] = React.useState(0);
  const [error, setError] = React.useState<RecorderError | null>(null);

  const ctxRef = React.useRef<AudioContext | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const processorRef = React.useRef<ScriptProcessorNode | null>(null);
  const sourceRef = React.useRef<MediaStreamAudioSourceNode | null>(null);
  const chunksRef = React.useRef<Float32Array[]>([]);
  const sampleRateRef = React.useRef(16000);

  const cleanup = React.useCallback(() => {
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    processorRef.current = null;
    sourceRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close().catch(() => undefined);
    ctxRef.current = null;
    setLevel(0);
  }, []);

  React.useEffect(() => cleanup, [cleanup]);

  const start = React.useCallback(async () => {
    setError(null);
    if (state === 'recording' || state === 'requesting') return;
    setState('requesting');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch (err) {
      const name = (err as DOMException)?.name;
      setState('idle');
      setError(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? { code: 'permission_denied', message: t('voice.micError.permissionDenied') }
          : name === 'NotFoundError' || name === 'OverconstrainedError'
            ? { code: 'no_device', message: t('voice.micError.noDevice') }
            : {
                code: 'unknown',
                message: t('voice.micError.startFailed', { message: (err as Error).message }),
              },
      );
      return;
    }

    streamRef.current = stream;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      cleanup();
      setState('idle');
      setError({ code: 'unknown', message: t('voice.micError.noWebAudio') });
      return;
    }
    const ctx = new Ctor();
    ctxRef.current = ctx;
    sampleRateRef.current = ctx.sampleRate;
    chunksRef.current = [];
    const source = ctx.createMediaStreamSource(stream);
    sourceRef.current = source;
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;
    processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      chunksRef.current.push(new Float32Array(input));
      setLevel(rms(input));
    };
    source.connect(processor);
    // ScriptProcessor 必须接到 destination 才会持续回调；
    // 经 0 增益节点落地，避免麦克风声音外放造成自激/回声
    const mute = ctx.createGain();
    mute.gain.value = 0;
    processor.connect(mute);
    mute.connect(ctx.destination);
    setState('recording');
  }, [cleanup, state, t]);

  const stopAndRecognize = React.useCallback(async (): Promise<string> => {
    if (state !== 'recording') return '';
    const ctxRate = sampleRateRef.current;
    const recorded = mergeChunks(chunksRef.current);
    cleanup();
    const durationMs = (recorded.length / ctxRate) * 1000;
    if (recorded.length === 0 || durationMs < MIN_AUDIO_MS) {
      setState('idle');
      setError({ code: 'too_short', message: t('voice.micError.tooShort') });
      return '';
    }
    const pcm16k = downsampleTo16k(recorded, ctxRate);
    const wav = encodeWav16k(pcm16k);
    setState('recognizing');
    try {
      const form = new FormData();
      form.append('file', new File([wav], 'speech.wav', { type: 'audio/wav' }));
      const result = await apiUpload<VoiceAsrResponse>(API.voiceAsr, form);
      setState('idle');
      return result.text;
    } catch (err) {
      setState('idle');
      setError({
        code: 'network',
        message: t('voice.micError.recognizeFailed', {
          message: err instanceof Error ? err.message : t('voice.micError.network'),
        }),
      });
      return '';
    }
  }, [cleanup, state, t]);

  const cancel = React.useCallback(() => {
    chunksRef.current = [];
    cleanup();
    setState('idle');
  }, [cleanup]);

  const clearError = React.useCallback(() => setError(null), []);

  return { state, level, error, start, stopAndRecognize, cancel, clearError };
}

function mergeChunks(chunks: Float32Array[]): Float32Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const merged = new Float32Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  return merged;
}
