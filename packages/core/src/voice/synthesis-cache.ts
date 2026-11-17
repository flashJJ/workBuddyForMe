import type { SynthResult } from './voice-runtime-types';

/** 短句合成缓存默认值：64 条 / 单条 80 字 / 约 8MB PCM */
export const SYNTH_CACHE_MAX_ENTRIES = 64;
export const SYNTH_CACHE_MAX_TEXT = 80;
export const SYNTH_CACHE_MAX_SAMPLES = 2_000_000;

export interface SynthesisCacheOptions {
  maxEntries?: number;
  maxTextLength?: number;
  maxSamples?: number;
}

/** 缓存键：模型 + 说话人 + 语速 + 文本；避免不同配置互相命中 */
export function synthesisCacheKey(
  modelId: string,
  speakerId: number,
  speed: number,
  text: string,
): string {
  return JSON.stringify([modelId, speakerId, speed, text.trim()]);
}

/**
 * 进程内短句 LRU（v4.6 M3）。
 * 只缓存短文本，按条数与 PCM 样本数双重淘汰；get 返回副本，调用方修改不污染缓存。
 */
export class SynthesisCache {
  private readonly entries = new Map<string, SynthResult>();
  private readonly maxEntries: number;
  private readonly maxTextLength: number;
  private readonly maxSamples: number;
  private totalSamples = 0;

  constructor(options: SynthesisCacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? SYNTH_CACHE_MAX_ENTRIES;
    this.maxTextLength = options.maxTextLength ?? SYNTH_CACHE_MAX_TEXT;
    this.maxSamples = options.maxSamples ?? SYNTH_CACHE_MAX_SAMPLES;
  }

  get(key: string): SynthResult | null {
    const hit = this.entries.get(key);
    if (!hit) return null;
    // 命中即刷新 LRU 顺序
    this.entries.delete(key);
    this.entries.set(key, hit);
    return { samples: new Float32Array(hit.samples), sampleRate: hit.sampleRate };
  }

  set(key: string, value: SynthResult, text: string): void {
    const trimmed = text.trim();
    // 空文本/长文/空音频不缓存：长文体积不可控，空音频没有复用价值
    if (!trimmed || trimmed.length > this.maxTextLength || value.samples.length === 0) return;

    const existing = this.entries.get(key);
    if (existing) {
      this.totalSamples -= existing.samples.length;
      this.entries.delete(key);
    }

    while (
      this.entries.size >= this.maxEntries ||
      this.totalSamples + value.samples.length > this.maxSamples
    ) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (oldestKey === undefined) break;
      const removed = this.entries.get(oldestKey);
      this.entries.delete(oldestKey);
      if (removed) this.totalSamples -= removed.samples.length;
    }

    this.entries.set(key, {
      samples: new Float32Array(value.samples),
      sampleRate: value.sampleRate,
    });
    this.totalSamples += value.samples.length;
  }

  clear(): void {
    this.entries.clear();
    this.totalSamples = 0;
  }

  get size(): number {
    return this.entries.size;
  }
}
