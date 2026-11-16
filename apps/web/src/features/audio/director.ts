import {
  AUDIO_DUCK_RATIO,
  AUDIO_MUTED_STORAGE_KEY,
  AUDIO_OUTPUT_STORAGE_KEY,
  AUDIO_SFX_MAX_CONCURRENT,
} from './constants';
import {
  normalizeOutputDevice,
  readOutputDevicePreference,
  writeOutputDevicePreference,
} from './output-device';
import type {
  AudioBackgroundKind,
  AudioDirectorListener,
  AudioDirectorSnapshot,
  AudioSink,
  AudioTrackKind,
} from './types';

/**
 * v4.2 音频导演：只持有音频状态，不创建播放器。
 *
 * - mute / 语音 duck / 背景互斥在这里统一计算；
 * - 各子系统注册 sink，收到 0–1 的最终系数后自己乘到基础音量；
 * - 单例挂在 web，不进入 shared（shared 保持纯数据）。
 */
export class AudioDirector {
  private sinks = new Map<AudioTrackKind, Set<AudioSink>>();
  private unlockHandlers = new Set<() => void>();
  private voiceSources = new Set<string>();
  private listeners = new Set<AudioDirectorListener>();
  private mutedValue = false;
  private outputDeviceValue: string | null = null;
  private backgroundValue: AudioBackgroundKind | null = null;
  private unlockedValue = false;
  private sfxActive = 0;
  private snapshot: AudioDirectorSnapshot;

  constructor() {
    this.mutedValue = readMutedPreference();
    this.outputDeviceValue = readOutputDevicePreference();
    this.snapshot = this.buildSnapshot();
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', this.handleStorage);
    }
  }

  getSnapshot = (): AudioDirectorSnapshot => this.snapshot;

  subscribe = (listener: AudioDirectorListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  get muted(): boolean {
    return this.mutedValue;
  }

  isMuted(): boolean {
    return this.mutedValue;
  }

  setMuted(muted: boolean): void {
    if (this.mutedValue === muted) return;
    this.mutedValue = muted;
    writeMutedPreference(muted);
    this.applyGains();
    this.emit();
  }

  toggleMuted(): void {
    this.setMuted(!this.mutedValue);
  }

  /** v4.3 M4：输出设备偏好；null = 系统默认 */
  getOutputDevice(): string | null {
    return this.outputDeviceValue;
  }

  setOutputDevice(deviceId: string | null): void {
    const next = normalizeOutputDevice(deviceId);
    if (this.outputDeviceValue === next) return;
    this.outputDeviceValue = next;
    writeOutputDevicePreference(next);
    this.applyOutputDevice();
    this.emit();
  }

  registerSink(kind: AudioTrackKind, sink: AudioSink): () => void {
    const set = this.sinks.get(kind) ?? new Set<AudioSink>();
    set.add(sink);
    this.sinks.set(kind, set);
    sink.setGain(this.gainFor(kind));
    sink.setSuspended?.(this.isSuspended(kind));
    sink.setOutputDevice?.(this.outputDeviceValue);
    return () => {
      const current = this.sinks.get(kind);
      current?.delete(sink);
      if (current && current.size === 0) this.sinks.delete(kind);
    };
  }

  registerUnlock(handler: () => void): () => void {
    this.unlockHandlers.add(handler);
    return () => this.unlockHandlers.delete(handler);
  }

  /** 多窗口语音：任一来源说话即 duck，全部结束才恢复 */
  setVoiceActive(sourceId: string, active: boolean): void {
    const id = sourceId.trim();
    if (!id) return;
    const before = this.voiceSources.size > 0;
    if (active) this.voiceSources.add(id);
    else this.voiceSources.delete(id);
    const after = this.voiceSources.size > 0;
    if (before === after) return;
    this.applyGains();
    this.emit();
  }

  /** 背景乐互斥：music 与 theater-bgm 同时最多一条 */
  setBackground(kind: AudioBackgroundKind | null): void {
    if (this.backgroundValue === kind) return;
    this.backgroundValue = kind;
    this.applySuspension();
    this.emit();
  }

  /** 首次用户手势：调用所有子系统的解锁回调；失败不影响其他回调 */
  unlock(): void {
    for (const handler of this.unlockHandlers) {
      try {
        handler();
      } catch {
        /* 单个子系统不支持音频时静默 */
      }
    }
    if (this.unlockedValue) return;
    this.unlockedValue = true;
    this.emit();
  }

  /** 音效限流：超过并发上限直接丢弃 */
  tryPlaySfx(): boolean {
    if (this.mutedValue) return false;
    if (this.sfxActive >= AUDIO_SFX_MAX_CONCURRENT) return false;
    this.sfxActive += 1;
    return true;
  }

  endSfx(): void {
    this.sfxActive = Math.max(0, this.sfxActive - 1);
  }

  gainFor(kind: AudioTrackKind): number {
    if (this.mutedValue) return 0;
    if (this.voiceSources.size > 0 && (kind === 'music' || kind === 'theater-bgm')) {
      return AUDIO_DUCK_RATIO;
    }
    return 1;
  }

  private isSuspended(kind: AudioTrackKind): boolean {
    if (kind === 'music') return this.backgroundValue === 'theater-bgm';
    if (kind === 'theater-bgm') return this.backgroundValue === 'music';
    return false;
  }

  private applyGains(): void {
    for (const [kind, sinks] of this.sinks) {
      const gain = this.gainFor(kind);
      for (const sink of sinks) sink.setGain(gain);
    }
  }

  private applySuspension(): void {
    for (const [kind, sinks] of this.sinks) {
      const suspended = this.isSuspended(kind);
      for (const sink of sinks) sink.setSuspended?.(suspended);
    }
  }

  private applyOutputDevice(): void {
    for (const sinks of this.sinks.values()) {
      for (const sink of sinks) sink.setOutputDevice?.(this.outputDeviceValue);
    }
  }

  /** 跨窗口同步：设置页改设备后，桌宠/舞台窗即时跟随 */
  private handleStorage = (event: StorageEvent): void => {
    if (event.key !== AUDIO_OUTPUT_STORAGE_KEY) return;
    const next = normalizeOutputDevice(event.newValue);
    if (this.outputDeviceValue === next) return;
    this.outputDeviceValue = next;
    this.applyOutputDevice();
    this.emit();
  };

  private buildSnapshot(): AudioDirectorSnapshot {
    return {
      muted: this.mutedValue,
      voiceActive: this.voiceSources.size > 0,
      background: this.backgroundValue,
      unlocked: this.unlockedValue,
      outputDevice: this.outputDeviceValue,
    };
  }

  private emit(): void {
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener(this.snapshot);
  }
}

function readMutedPreference(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(AUDIO_MUTED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeMutedPreference(muted: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(AUDIO_MUTED_STORAGE_KEY, muted ? '1' : '0');
  } catch {
    /* 隐私模式忽略 */
  }
}

export const audioDirector = new AudioDirector();
