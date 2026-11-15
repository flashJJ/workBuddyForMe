/**
 * M0d T2.2/T2.3：语义表情通道混合器。
 *
 * 三份数据：dev 预览通道打底、行为轨道覆盖、合成后交给 MorphExecutor。
 * 从 VrmAnimationRuntime 抽出，避免适配层继续膨胀。
 */

import { MorphExecutor, type MorphDebugSnapshot } from './executor';

interface MorphTrack {
  channels: Readonly<Record<string, number>>;
  weight?: number;
}

export class MorphMixer {
  private executor: MorphExecutor | null = null;
  private readonly preview = new Map<string, number>();
  private readonly behavior = new Map<string, number>();
  private readonly effective = new Map<string, number>();

  attach(executor: MorphExecutor): void {
    this.executor = executor;
  }

  /** dev 预览；null/空 = 释放预览层 */
  setPreview(channels: Readonly<Record<string, number>> | null): void {
    this.preview.clear();
    if (channels) {
      for (const [channel, value] of Object.entries(channels)) this.preview.set(channel, value);
    }
    this.rebuild();
  }

  /** 每帧进入新阶段前清空行为层 */
  clearBehavior(): void {
    this.behavior.clear();
    this.rebuild();
  }

  /** 行为表情轨道 → 通道；同通道取最大，避免 enter/loop 叠加翻倍 */
  collect(track: MorphTrack, weight: number): void {
    const scale = weight * (track.weight ?? 1);
    for (const [channel, value] of Object.entries(track.channels)) {
      const scaled = value * scale;
      if (!(scaled > 0)) continue;
      const next = scaled > 1 ? 1 : scaled;
      if (next > (this.behavior.get(channel) ?? 0)) this.behavior.set(channel, next);
    }
    this.rebuild();
  }

  apply(): number {
    return this.executor ? this.executor.apply(this.effective) : 0;
  }

  get debug(): MorphDebugSnapshot | null {
    return this.executor?.snapshot(this.effective) ?? null;
  }

  /** 预览打底，行为覆盖同名通道 */
  private rebuild(): void {
    this.effective.clear();
    for (const [channel, value] of this.preview) this.effective.set(channel, value);
    for (const [channel, value] of this.behavior) this.effective.set(channel, value);
  }
}
