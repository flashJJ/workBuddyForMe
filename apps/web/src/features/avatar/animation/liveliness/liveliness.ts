/**
 * T2.6 自然度层（liveliness）：在「动画 / IK 之后、ROM 之前」给上身叠一层极小偏移。
 *
 * 只做三件事，全部本地计算、不依赖 AI：
 * 1. 呼吸：脊柱/胸/肩的慢速正弦（周期约 3.8s），用力时自动变浅；
 * 2. 不对称：预定义偏移池 + 慢速轮换，避免 LLM/姿势库常见的左右对称；
 * 3. 微小扰动：平滑正弦伪噪声，只作用在非末端骨骼；tension 越高幅度越小。
 *
 * 叠加方式：先撤销上一帧自己写入的增量（`cur * prev^-1`），再从基准姿态乘新增量。
 * 这样无论别层本帧有没有重写骨骼，都不会累积漂移。
 */

import type { BoneQuat, BoneRotation } from '../contracts';
import { clamp01, quatFromEuler, quatMultiply } from '../math';
import type { Skeleton } from '../skeleton';

export interface LivelinessParams {
  /** 紧绷度：0 放松、1 用力（越高呼吸越浅、微扰越小、越对称） */
  tension: number;
  /** 不对称度：0 对称、0.3~0.6 自然 */
  asymmetry: number;
  /** 呼吸叠加权重 0~1 */
  breathMix: number;
  /** 微小扰动权重 0~1 */
  microMotion: number;
}

export const DEFAULT_LIVELINESS: LivelinessParams = {
  tension: 0.25,
  asymmetry: 0.4,
  breathMix: 0.7,
  microMotion: 0.5,
};

const BREATH_PERIOD_S = 3.8;
const BANK_HOLD_S = 18;
const BONES = ['spine', 'chest', 'leftShoulder', 'rightShoulder', 'leftUpperArm', 'rightUpperArm'] as const;

/** 对称扰动幅度（弧度）；手指/末端不加，避免抓取时飘 */
const NOISE_AMP: Readonly<Record<string, number>> = {
  spine: 0.012,
  chest: 0.01,
  leftShoulder: 0.014,
  rightShoulder: 0.014,
  leftUpperArm: 0.018,
  rightUpperArm: 0.018,
};

/** 预定义不对称池：几组固定的单侧微小偏移，不是随机乱扭 */
const ASYMMETRY_BANK: readonly Partial<Record<string, BoneRotation>>[] = [
  { spine: { z: 0.02 }, leftShoulder: { z: 0.015 }, rightShoulder: { z: -0.01 }, leftUpperArm: { z: 0.012 } },
  { spine: { z: -0.018, y: 0.012 }, leftShoulder: { z: -0.012 }, rightShoulder: { z: 0.018 } },
  { spine: { z: 0.012, y: -0.01 }, leftShoulder: { z: 0.02 }, leftUpperArm: { x: 0.015 } },
];

/** 1D 平滑伪噪声：两个不可通约频率的正弦叠加，连续且不会突然跳变 */
function smoothNoise(t: number, seed: number): number {
  return Math.sin(t * 0.83 + seed) * 0.6 + Math.sin(t * 1.37 + seed * 1.7) * 0.4;
}

/**
 * 重心支撑校验：髋部投影到「双脚连线」的距离。
 * 落在半宽内 → 1；超出半个 falloff → 0，中间线性过渡。
 * 只用来衰减不对称强度，不直接改骨骼。
 */
export function supportFactor(
  hipsX: number,
  hipsZ: number,
  leftX: number,
  leftZ: number,
  rightX: number,
  rightZ: number,
  halfWidth = 0.09,
  falloff = 0.14,
): number {
  const dx = rightX - leftX;
  const dz = rightZ - leftZ;
  const lenSq = dx * dx + dz * dz;
  let t = 0;
  if (lenSq > 1e-8) {
    t = clamp01(((hipsX - leftX) * dx + (hipsZ - leftZ) * dz) / lenSq);
  }
  const px = leftX + dx * t;
  const pz = leftZ + dz * t;
  const dist = Math.hypot(hipsX - px, hipsZ - pz);
  if (dist <= halfWidth) return 1;
  return clamp01(1 - (dist - halfWidth) / Math.max(1e-6, falloff));
}

const IDENTITY: Readonly<BoneQuat> = { x: 0, y: 0, z: 0, w: 1 };

export class LivelinessLayer {
  private phase = 0;
  private elapsed = 0;
  private bankIndex = 0;
  private bankAt = 0;
  /** 每个骨骼上一帧写入的增量，用于撤销后再叠加 */
  private readonly deltas = new Map<string, BoneQuat>();
  private readonly cur: BoneQuat = { x: 0, y: 0, z: 0, w: 1 };
  private readonly base: BoneQuat = { x: 0, y: 0, z: 0, w: 1 };
  private readonly next: BoneQuat = { x: 0, y: 0, z: 0, w: 1 };
  private readonly inverse: BoneQuat = { x: 0, y: 0, z: 0, w: 1 };
  private readonly delta: BoneQuat = { x: 0, y: 0, z: 0, w: 1 };

  /**
   * @param support 0..1 重心支撑系数（`supportFactor` 的结果）
   * @param sleeping 睡眠时保留呼吸、关闭不对称与扰动
   */
  update(
    skeleton: Skeleton,
    params: LivelinessParams,
    dt: number,
    support: number,
    sleeping = false,
  ): void {
    if (!(dt > 0)) return;
    this.elapsed += dt;
    this.phase += (dt * Math.PI * 2) / BREATH_PERIOD_S;
    if (this.elapsed - this.bankAt >= BANK_HOLD_S) {
      this.bankAt = this.elapsed;
      this.bankIndex = (this.bankIndex + 1) % ASYMMETRY_BANK.length;
    }

    const tension = clamp01(params.tension);
    const breath = clamp01(params.breathMix) * (1 - 0.55 * tension);
    const asym = clamp01(params.asymmetry) * clamp01(support) * (1 - 0.5 * tension);
    const noise = clamp01(params.microMotion) * (1 - tension);
    const bank = ASYMMETRY_BANK[this.bankIndex] ?? {};
    const breathWave = Math.sin(this.phase);

    for (const name of BONES) {
      if (!skeleton.has(name)) continue;
      const euler = {
        x: breathWave * (name === 'chest' ? 0.016 : name === 'spine' ? 0.01 : 0) * breath,
        y: 0,
        z: 0,
      };
      if (name === 'leftShoulder') euler.z = breathWave * 0.008 * breath;
      if (name === 'rightShoulder') euler.z = -breathWave * 0.008 * breath;
      if (!sleeping) {
        const a = bank[name];
        if (a) {
          euler.x += (a.x ?? 0) * asym;
          euler.y += (a.y ?? 0) * asym;
          euler.z += (a.z ?? 0) * asym;
        }
        const amp = (NOISE_AMP[name] ?? 0) * noise;
        if (amp > 0) {
          euler.x += smoothNoise(this.elapsed + noiseSeed(name), 0.7) * amp;
          euler.y += smoothNoise(this.elapsed + noiseSeed(name), 2.1) * amp * 0.6;
          euler.z += smoothNoise(this.elapsed + noiseSeed(name), 4.3) * amp * 0.8;
        }
      }
      quatFromEuler(this.delta, euler.x, euler.y, euler.z);
      const prev = this.deltas.get(name) ?? IDENTITY;
      // base = cur * prev^-1：撤销上一帧自己的增量，避免在无重写的骨骼上累积
      this.inverse.x = -prev.x;
      this.inverse.y = -prev.y;
      this.inverse.z = -prev.z;
      this.inverse.w = prev.w;
      skeleton.read(name, this.cur);
      quatMultiply(this.base, this.cur, this.inverse);
      quatMultiply(this.next, this.base, this.delta);
      skeleton.write(name, this.next);
      const stored = this.deltas.get(name);
      if (stored) {
        stored.x = this.delta.x;
        stored.y = this.delta.y;
        stored.z = this.delta.z;
        stored.w = this.delta.w;
      } else {
        this.deltas.set(name, { x: this.delta.x, y: this.delta.y, z: this.delta.z, w: this.delta.w });
      }
    }
  }
}

/** 每根骨骼固定的噪声相位种子（跨会话稳定，避免每次启动抖动模式不同） */
function noiseSeed(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) % 997;
  return hash * 0.013;
}
