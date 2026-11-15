/**
 * 行为切换的手臂交叉淡化。
 *
 * 新行为第一帧权重为 0；若直接用绑定姿态当基准，会先露出 T/A-pose。
 * 这里在切换瞬间捕获上一帧的手臂姿势，作为本帧 Composer 的基准，
 * 让执行器从「上一姿势」直接向新目标过渡，而不是先回到自然垂臂。
 */

import type { BoneMask, BoneQuat } from '../contracts';
import type { Skeleton } from '../skeleton';

const ARM_MASK: BoneMask = { include: ['leftArm', 'rightArm'] };
/** 最短淡化时长；新行为权重达到 0.95 后释放 */
const FADE_MS = 180;
const WEIGHT_READY = 0.95;

export class BoneCrossFade {
  private from: Map<string, BoneQuat> | null = null;
  private elapsed = 0;
  private durationMs = FADE_MS;
  /** 上一帧最终渲染的手臂姿势；在 captureFrame 重置骨骼前记录 */
  private readonly last = new Map<string, BoneQuat>();
  private readonly scratch: BoneQuat = { x: 0, y: 0, z: 0, w: 1 };

  get active(): boolean {
    return this.from !== null;
  }

  /**
   * 每帧骨骼被重置为 mixer 姿势前调用，记录上一帧最终渲染姿势。
   * 行为在帧内自动切换（如 lifted exit → land enter）时，节点已被重置，
   * 只有这里缓存的姿势还能作为交叉淡化起点。
   */
  remember(skeleton: Skeleton): void {
    for (const name of skeleton.namesForMask(ARM_MASK)) {
      let quat = this.last.get(name);
      if (!quat) {
        quat = { x: 0, y: 0, z: 0, w: 1 };
        this.last.set(name, quat);
      }
      skeleton.read(name, quat);
    }
  }

  /** 捕获当前手臂姿势作为淡化起点（骨骼此刻应仍是上一帧渲染结果） */
  begin(skeleton: Skeleton, durationMs = FADE_MS): void {
    const from = new Map<string, BoneQuat>();
    for (const name of skeleton.namesForMask(ARM_MASK)) {
      const remembered = this.last.get(name);
      if (remembered) from.set(name, { ...remembered });
      else if (skeleton.read(name, this.scratch)) from.set(name, { ...this.scratch });
    }
    this.from = from.size > 0 ? from : null;
    this.elapsed = 0;
    this.durationMs = Math.max(30, durationMs);
  }

  /**
   * 每帧推进；必须等新行为权重接近 1 才释放。
   * 不能按固定上限强制释放：慢动作 fade 600–700ms，权重过半时若换回 mixer 基准，
   * 手臂会在一帧内跳回 A-pose，看起来就是「先慢后突然飞快」。
   */
  advance(dtMs: number, weight: number): void {
    if (!this.from) return;
    this.elapsed += Math.max(0, dtMs);
    if (this.elapsed >= this.durationMs && weight >= WEIGHT_READY) this.from = null;
  }

  /** Composer 之前调用：把起点姿势写进帧快照 */
  apply(skeleton: Skeleton): void {
    if (this.from) skeleton.overrideFrame(this.from);
  }

  reset(): void {
    this.from = null;
    this.elapsed = 0;
  }
}
