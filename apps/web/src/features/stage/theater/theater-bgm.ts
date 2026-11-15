'use client';

import type { TheaterMusicMood } from './episodes/types';

/**
 * 剧场背景乐：复用内置的 CC0 曲目（来源与作者见 ASSETS-LICENSE.md）。
 * 情绪 → 曲目映射与四套剧集类型标签一致，换幕时淡出旧曲再淡入新曲。
 */
const TRACKS: Record<TheaterMusicMood, string> = {
  warm: '/audio/music/theme-warm.mp3',
  playful: '/audio/music/theme-playful.mp3',
  tense: '/audio/music/theme-tense.mp3',
  melancholy: '/audio/music/theme-melancholy.mp3',
};

const BASE_VOLUME = 0.3;
const DUCK_RATIO = 0.35;
const DUCK_FADE_MS = 120;
const FADE_MS = 800;
const FADE_STEP_MS = 40;

function clampVolume(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export class TheaterBgm {
  private el: HTMLAudioElement | null = null;
  private fadeTimer: ReturnType<typeof setInterval> | null = null;
  private mood: TheaterMusicMood = 'warm';
  private running = false;
  private muted = false;
  private ducked = false;

  /** 启动/恢复背景乐；返回 false 表示被浏览器自动播放策略拦截 */
  async start(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    const el = this.ensure();
    if (!el) return false;
    // 停止期间切过情绪时，补齐曲目再播放
    if (!el.src.endsWith(TRACKS[this.mood])) this.loadTrack();
    this.running = true;
    try {
      if (el.paused) await el.play();
    } catch {
      /* 自动播放策略拦截：等用户手势后再试 */
      this.running = false;
      return false;
    }
    // play() 期间可能已被 pause/静音/退出，按最新状态决定是否发声
    if (!this.running) {
      el.pause();
      return false;
    }
    this.fadeTo(this.targetVolume());
    return true;
  }

  stop(): void {
    this.running = false;
    this.fadeTo(0, () => {
      if (!this.running) this.el?.pause();
    });
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.fadeTo(this.targetVolume());
  }

  /** 切换配乐情绪：运行中淡出旧曲、换源后再淡入；未运行时只记录，下次 start 生效 */
  setMood(mood: TheaterMusicMood): void {
    if (this.mood === mood) return;
    this.mood = mood;
    if (!this.running) return;
    const el = this.el;
    if (!el) return;
    this.fadeTo(0, () => {
      if (!this.running) return;
      this.loadTrack();
      void el.play().catch(() => undefined);
      this.fadeTo(this.targetVolume());
    });
  }

  /** 说话时把 BGM 压到 35%，避免盖住台词 */
  setDucked(ducked: boolean): void {
    if (this.ducked === ducked) return;
    this.ducked = ducked;
    if (this.running) this.fadeTo(this.targetVolume(), undefined, DUCK_FADE_MS);
  }

  dispose(): void {
    this.running = false;
    this.clearFade();
    const el = this.el;
    this.el = null;
    if (!el) return;
    el.pause();
    el.removeAttribute('src');
    el.load();
  }

  private ensure(): HTMLAudioElement | null {
    if (this.el) return this.el;
    const el = new Audio(TRACKS[this.mood]);
    el.loop = true;
    el.preload = 'auto';
    el.volume = 0;
    this.el = el;
    return el;
  }

  private loadTrack(): void {
    const el = this.el;
    if (!el) return;
    el.src = TRACKS[this.mood];
    el.volume = 0;
  }

  /** 运行态 × 静音 × 闪避 → 目标音量 */
  private targetVolume(): number {
    if (!this.running || this.muted) return 0;
    return BASE_VOLUME * (this.ducked ? DUCK_RATIO : 1);
  }

  /** 唯一改音量入口：线性渐变到目标值，结束后可执行一次收尾 */
  private fadeTo(target: number, done?: () => void, duration = FADE_MS): void {
    this.clearFade();
    const el = this.el;
    if (!el) {
      done?.();
      return;
    }
    const from = el.volume;
    const steps = Math.max(1, Math.round(duration / FADE_STEP_MS));
    let step = 0;
    this.fadeTimer = setInterval(() => {
      step += 1;
      el.volume = clampVolume(from + ((target - from) * step) / steps);
      if (step < steps) return;
      this.clearFade();
      el.volume = clampVolume(target);
      done?.();
    }, FADE_STEP_MS);
  }

  private clearFade(): void {
    if (!this.fadeTimer) return;
    clearInterval(this.fadeTimer);
    this.fadeTimer = null;
  }
}
