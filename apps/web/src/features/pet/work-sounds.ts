'use client';

export type WorkSoundKind = 'success' | 'error' | 'approval';

let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (context) return context;
  const ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!ctor) return null;
  context = new ctor();
  return context;
}

function beep(ctx: AudioContext, frequency: number, startAt: number, duration: number): void {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(0.08, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration);
}

/**
 * v2.7 工作提示音：短促合成音，无音频资源依赖。
 * 用户手势/系统通知可能限制自动播放；失败静默，不影响状态展示。
 */
export function playWorkSound(kind: WorkSoundKind): void {
  const ctx = getContext();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime + 0.02;
    if (kind === 'success') beep(ctx, 880, now, 0.18);
    else if (kind === 'error') beep(ctx, 392, now, 0.26);
    else {
      beep(ctx, 660, now, 0.12);
      beep(ctx, 660, now + 0.2, 0.12);
    }
  } catch {
    /* 音频不可用时静默 */
  }
}
