'use client';

import * as React from 'react';
import { Mic, MicOff, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { rms } from '../pcm-wav';

type TestState = 'idle' | 'checking' | 'ok' | 'silent' | 'denied' | 'absent' | 'error';

const TEST_DURATION_MS = 4000;
/** 经验阈值：RMS 持续超过该值视为麦克风有输入 */
const SPEAK_THRESHOLD = 0.02;

/**
 * 麦克风设备自检：采集 4 秒实时电平，按峰值判定「设备可用 / 没声音 / 无权限 / 无设备」。
 * 纯客户端检测，不录音上传。
 */
export function MicSelfTest() {
  const [state, setState] = React.useState<TestState>('idle');
  const [level, setLevel] = React.useState(0);
  const [peak, setPeak] = React.useState(0);

  const ctxRef = React.useRef<AudioContext | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const processorRef = React.useRef<ScriptProcessorNode | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const stopTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const peakRef = React.useRef(0);
  const levelQueueRef = React.useRef<number[]>([]);

  const cleanup = React.useCallback(() => {
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    processorRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    void ctxRef.current?.close().catch(() => undefined);
    processorRef.current = null;
    streamRef.current = null;
    ctxRef.current = null;
    rafRef.current = null;
    setLevel(0);
  }, []);

  React.useEffect(() => cleanup, [cleanup]);

  const start = React.useCallback(async () => {
    cleanup();
    peakRef.current = 0;
    setPeak(0);
    levelQueueRef.current = [];
    setState('checking');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch (err) {
      const name = (err as DOMException)?.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setState('denied');
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        setState('absent');
      } else {
        setState('error');
      }
      return;
    }

    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      stream.getTracks().forEach((t) => t.stop());
      setState('error');
      return;
    }
    const ctx = new Ctor();
    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (event) => {
      levelQueueRef.current.push(rms(event.inputBuffer.getChannelData(0)));
    };
    // 0 增益落地，避免自检声音外放
    const mute = ctx.createGain();
    mute.gain.value = 0;
    source.connect(processor);
    processor.connect(mute);
    mute.connect(ctx.destination);
    ctxRef.current = ctx;
    streamRef.current = stream;
    processorRef.current = processor;

    const tick = () => {
      const current = levelQueueRef.current.at(-1) ?? 0;
      setLevel(current);
      peakRef.current = Math.max(peakRef.current, current);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    stopTimerRef.current = setTimeout(() => {
      const observed = peakRef.current;
      setPeak(observed);
      cleanup();
      setState(observed >= SPEAK_THRESHOLD ? 'ok' : 'silent');
    }, TEST_DURATION_MS);
  }, [cleanup]);

  const stop = React.useCallback(() => {
    const observed = peakRef.current;
    setPeak(observed);
    cleanup();
    // 手动停止：已听到声音算正常，否则提示太安静
    setState(observed >= SPEAK_THRESHOLD ? 'ok' : 'silent');
  }, [cleanup]);

  const resultText: Record<TestState, string | null> = {
    idle: null,
    checking: `正在聆听…请对着麦克风说话（${TEST_DURATION_MS / 1000} 秒）`,
    ok: '麦克风工作正常，已采集到清晰声音输入',
    silent: '设备可用但未采集到声音，请对着麦克风说话或检查系统录音音量',
    denied: '麦克风权限被拒绝，请在系统/浏览器设置中允许后重试',
    absent: '未检测到麦克风设备，请连接后重试',
    error: '麦克风检测失败：当前环境不支持 Web Audio',
  };
  const checking = state === 'checking';

  return (
    <div className="space-y-2" data-testid="mic-self-test">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant={checking ? 'default' : 'outline'}
          size="sm"
          onClick={checking ? stop : () => void start()}
          data-testid="mic-self-test-button"
        >
          {checking ? (
            <>
              <Square className="mr-1 h-3.5 w-3.5" />
              停止检测
            </>
          ) : (
            <>
              <Mic className="mr-1 h-3.5 w-3.5" />
              麦克风自检
            </>
          )}
        </Button>
        {(state === 'denied' || state === 'absent') && <MicOff className="h-4 w-4 text-destructive" />}
      </div>
      {checking && (
        <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${Math.round(Math.min(1, level * 5) * 100)}%` }}
            data-testid="mic-self-test-level"
          />
        </div>
      )}
      {resultText[state] && (
        <p
          className="text-xs text-muted-foreground data-[state=ok]:text-success data-[state=denied]:text-destructive data-[state=absent]:text-destructive data-[state=error]:text-destructive data-[state=silent]:text-warning"
          data-state={state}
          data-testid="mic-self-test-result"
        >
          {resultText[state]}
          {(state === 'ok' || state === 'silent') && peak > 0
            ? `（峰值电平 ${peak.toFixed(3)}）`
            : ''}
        </p>
      )}
    </div>
  );
}
