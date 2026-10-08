'use client';

import * as React from 'react';
import { VadDetector, type VadEvent, type VadGate, type VadSensitivity } from './vad-detector';

const WORKLET_URL = '/worklets/vad-capture.worklet.js';
/** worklet 每帧 16k 样本数（与 vad-capture.worklet.js 保持一致） */
const FRAME_SAMPLES = 512;

export type VadMonitorPhase = 'off' | 'starting' | 'on';

export interface VadMonitorError {
  code: 'permission_denied' | 'no_device' | 'unsupported' | 'unknown';
  message: string;
}

export interface VadMonitorOptions {
  /** 持续聆听开关；切换即启停麦克风（effect 拥有全部音频资源生命周期） */
  enabled: boolean;
  sensitivity: VadSensitivity;
  /** 尾静音 ms（用户设置 vadSilenceMs） */
  silenceMs: number;
  /** 每帧读取播放回声门控快照（speaking / 冷却窗） */
  getGate: () => VadGate;
  /** VAD 判出完整语音段（已过滤 <minSpeech 的 discard） */
  onSegment: (samples16k: Float32Array) => void;
  /** 状态机事件（speech-start 用于同步触发 barge-in） */
  onVadEvent?: (event: VadEvent) => void;
  /** 每帧电平（0~1，UI 聆听指示） */
  onLevel?: (rms: number) => void;
}

export interface VadMonitor {
  phase: VadMonitorPhase;
  error: VadMonitorError | null;
  clearError: () => void;
}

interface WorkletFrameMessage {
  rms: number;
  pcm16k: ArrayBuffer;
}

/**
 * 持续聆听监控：
 * getUserMedia → AudioWorklet（16k/32ms 帧 + RMS）→ VadDetector → 段缓冲 → onSegment。
 *
 * 资源纪律（M3 StrictMode 教训）：AudioContext/Stream/Node 全部在 effect 内创建、
 * cleanup 内销毁；检测器无副作用可随配置 memo 重建。候选期帧即入缓冲（不丢起字），
 * 候选取消/discard 丢弃缓冲。
 */
export function useVadMonitor(options: VadMonitorOptions): VadMonitor {
  const { enabled, sensitivity, silenceMs, getGate, onSegment, onVadEvent, onLevel } = options;
  const [phase, setPhase] = React.useState<VadMonitorPhase>('off');
  const [error, setError] = React.useState<VadMonitorError | null>(null);

  const detector = React.useMemo(
    () => new VadDetector({ sensitivity, silenceMs }),
    [sensitivity, silenceMs],
  );

  // 回调与门控走 ref，帧处理器只订阅一次，不因重渲染重建音频管线
  const cbRef = React.useRef({ getGate, onSegment, onVadEvent, onLevel });
  cbRef.current = { getGate, onSegment, onVadEvent, onLevel };

  React.useEffect(() => {
    if (!enabled) {
      setPhase('off');
      return;
    }

    let cancelled = false;
    let ctx: AudioContext | null = null;
    let stream: MediaStream | null = null;
    let node: AudioWorkletNode | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let buffering = false;
    let buffer: Float32Array[] = [];

    const resetBuffer = () => {
      buffering = false;
      buffer = [];
    };

    const flushSegment = () => {
      if (!buffering) return;
      const total = buffer.reduce((n, c) => n + c.length, 0);
      const merged = new Float32Array(total);
      let offset = 0;
      for (const chunk of buffer) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      resetBuffer();
      cbRef.current.onSegment(merged);
    };

    const handleFrame = (event: MessageEvent<WorkletFrameMessage>) => {
      const data = event.data;
      if (!data || typeof data.rms !== 'number' || !data.pcm16k) return;
      const pcm = new Float32Array(data.pcm16k);
      const vadEvent = detector.sample({
        rms: data.rms,
        ms: (pcm.length / 16000) * 1000,
        gate: cbRef.current.getGate(),
      });

      if (vadEvent === 'candidate') {
        // 候选帧即段首（保留起字）
        buffering = true;
        buffer = [pcm];
      } else if (buffering) {
        buffer.push(pcm);
      }

      if (vadEvent === 'candidate-cancel' || vadEvent === 'discard') {
        resetBuffer();
      } else if (vadEvent === 'speech-end') {
        flushSegment();
      }

      cbRef.current.onVadEvent?.(vadEvent);
      cbRef.current.onLevel?.(data.rms);
    };

    setError(null);
    setPhase('starting');

    void (async () => {
      try {
        // 不硬约束 sampleRate/channelCount：部分设备（Electron 音频管线）在不支持时
        // 会给到异常轨道（静音/极低增益）；与 PTT 自检链路一致，只开回声消除+降噪，
        // 采样率由 worklet 按 AudioContext 实际速率重采样（兼容 48k/16k 等）。
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        if (cancelled) {
          mediaStream.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = mediaStream;

        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor || !AudioWorkletNode) throw new VadUnsupportedError();

        const audioCtx = new Ctor();
        ctx = audioCtx;
        if (audioCtx.state === 'suspended') await audioCtx.resume();
        await audioCtx.audioWorklet.addModule(WORKLET_URL);

        const workletNode = new AudioWorkletNode(audioCtx, 'vad-capture');
        node = workletNode;
        const mediaSource = audioCtx.createMediaStreamSource(mediaStream);
        source = mediaSource;
        // AudioWorkletNode 的 process 只在渲染图被牵引时调度：node 必须沿输出
        // 连到 destination（输入连接不足以让它持续 tick）。经 0 增益 GainNode 落地，
        // 麦克风声音不外放、无自激。
        mediaSource.connect(workletNode);
        const mute = audioCtx.createGain();
        mute.gain.value = 0;
        workletNode.connect(mute);
        mute.connect(audioCtx.destination);
        workletNode.port.onmessage = handleFrame;
        workletNode.port.start();

        // StrictMode 下被清理的旧挂载链在此退出（其 node/port 由自己的 catch 清理），
        // 绝不发 start——否则帧会发给已被置空 handler 的旧节点，幸存链反而不产帧。
        if (cancelled) throw new Error('cancelled');
        setPhase('on');
        // 就绪握手：仅存活链通知 worklet 开始产帧（避免 node 构造后首个渲染量子
        // 早于 onmessage 挂载导致起始帧丢失；真实 worklet 可忽略此消息）
        workletNode.port.postMessage({ type: 'wbfm:start' });
      } catch (err) {
        cleanupAudio();
        if (cancelled) return;
        setPhase('off');
        setError(mapAudioError(err));
      }
    })();

    function cleanupAudio() {
      if (node) node.port.onmessage = null;
      node?.disconnect();
      source?.disconnect();
      stream?.getTracks().forEach((t) => t.stop());
      if (ctx) void ctx.close().catch(() => undefined);
      node = null;
      source = null;
      stream = null;
      ctx = null;
    }

    return () => {
      cancelled = true;
      detector.reset();
      resetBuffer();
      cleanupAudio();
      setPhase('off');
    };
  }, [enabled, detector]);

  const clearError = React.useCallback(() => setError(null), []);

  return { phase, error, clearError };
}

class VadUnsupportedError extends Error {
  constructor() {
    super('AudioWorklet 不可用');
    this.name = 'VadUnsupportedError';
  }
}

function mapAudioError(err: unknown): VadMonitorError {
  if (err instanceof VadUnsupportedError) {
    return { code: 'unsupported', message: '当前浏览器不支持 AudioWorklet，无法持续聆听' };
  }
  const name = (err as DOMException)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return { code: 'permission_denied', message: '麦克风权限被拒绝，请在浏览器/系统设置中允许' };
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return { code: 'no_device', message: '未检测到麦克风设备' };
  }
  return {
    code: 'unknown',
    message: `无法启动持续聆听：${err instanceof Error ? err.message : '未知错误'}`,
  };
}

// 保持常量与 worklet 一致（类型层引用，防漂移）
export const VAD_FRAME_SAMPLES = FRAME_SAMPLES;
