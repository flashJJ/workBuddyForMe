'use client';

import type { TheaterGenre } from './episodes/types';
import { audioDirector } from '../../audio';

/**
 * 剧场短音效：WebAudio 合成，不引入外部音频素材。
 * - curtain：幕布拉开的低频噪声缓升；
 * - line：换句的短促提示音。
 * 静音与并发限制统一走 AudioDirector；自动播放策略拦截时静默跳过。
 */
export type TheaterSfxKind = 'curtain' | 'line';

/** 不同类型标签的换句提示音（起频 → 落频） */
const LINE_TONES: Record<TheaterGenre, readonly [number, number]> = {
  comedy: [1046.5, 1568],
  'slice-of-life': [760, 1180],
  tragedy: [392, 330],
  mystery: [660, 880],
};

let context: AudioContext | null = null;

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!context) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
  }
  return context;
}

/** v4.2：首次用户手势统一解锁；失败时下一次手势再试 */
export function unlockTheaterSfx(): void {
  const ctx = ensureContext();
  if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
}

export async function playTheaterSfx(
  kind: TheaterSfxKind,
  genre?: TheaterGenre | null,
): Promise<void> {
  if (!audioDirector.tryPlaySfx()) return;
  const ctx = ensureContext();
  if (!ctx) {
    audioDirector.endSfx();
    return;
  }
  try {
    if (ctx.state !== 'running') await ctx.resume();
  } catch {
    /* 自动播放策略拦截：等用户手势后下一次再试 */
  }
  if (ctx.state !== 'running') {
    audioDirector.endSfx();
    return;
  }
  const now = ctx.currentTime;
  const done = () => audioDirector.endSfx();
  if (kind === 'curtain') playCurtain(ctx, now, done);
  else playLine(ctx, now, genre ?? 'slice-of-life', done);
}

function playCurtain(ctx: AudioContext, now: number, onEnded: () => void): void {
  const length = Math.floor(ctx.sampleRate * 0.9);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    const t = i / length;
    data[i] = (Math.random() * 2 - 1) * (1 - t) ** 2 * 0.5;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(260, now);
  filter.frequency.linearRampToValueAtTime(1600, now + 0.5);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.12, now + 0.12);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.onended = onEnded;
  source.start(now);
  source.stop(now + 0.95);
}

function playLine(ctx: AudioContext, now: number, genre: TheaterGenre, onEnded: () => void): void {
  const [from, to] = LINE_TONES[genre];
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(from, now);
  osc.frequency.exponentialRampToValueAtTime(to, now + 0.09);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.045, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.onended = onEnded;
  osc.start(now);
  osc.stop(now + 0.18);
}
