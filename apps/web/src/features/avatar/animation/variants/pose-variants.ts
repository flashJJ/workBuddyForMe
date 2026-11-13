/**
 * 姿态变体簇（T2.6）：同一个语义姿势存 3~8 个细微差异样本，运行时轮换并交叉淡入。
 *
 * 目的：避免「同一个标准姿势每次出现都一模一样」。变体只改骨骼角度，
 * 不改变 mask / additive 语义，因此可以直接喂给现有的 `applyPose`。
 */

import type { BoneRotation, PoseDefinition } from '../contracts';
import { clamp01 } from '../math';

export interface VariantResolverOptions {
  /** 每个变体保持多久（毫秒） */
  holdMs?: number;
  /** 变体之间交叉淡入时长（毫秒） */
  blendMs?: number;
  /** 0..1 随机源；测试可注入固定序列 */
  random?: () => number;
}

interface VariantState {
  from: number;
  to: number;
  blendStart: number;
  switchAt: number;
}

const DEFAULT_HOLD_MS = 9000;
const DEFAULT_BLEND_MS = 600;

function smoothstep(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

function lerpBone(
  a: BoneRotation | undefined,
  b: BoneRotation | undefined,
  t: number,
): BoneRotation {
  // 任一帧缺失的分量按 0 处理，保证变体之间的差异收敛到基准
  return {
    x: (a?.x ?? 0) + ((b?.x ?? 0) - (a?.x ?? 0)) * t,
    y: (a?.y ?? 0) + ((b?.y ?? 0) - (a?.y ?? 0)) * t,
    z: (a?.z ?? 0) + ((b?.z ?? 0) - (a?.z ?? 0)) * t,
  };
}

function blendBones(
  from: PoseDefinition['bones'],
  to: PoseDefinition['bones'],
  t: number,
): PoseDefinition['bones'] {
  const bones: Record<string, BoneRotation> = {};
  const names = new Set([...Object.keys(from), ...Object.keys(to)]);
  for (const name of names) {
    const a = from[name];
    const b = to[name];
    // 只有一侧存在时，缺失侧视为「不旋转」，避免切换瞬间跳变
    bones[name] = lerpBone(a, b, t);
  }
  return bones;
}

/** 变体轮换器：按 pose id 维护独立状态，切换时做短暂交叉淡入 */
export class PoseVariantResolver {
  private readonly states = new Map<string, VariantState>();
  private readonly holdMs: number;
  private readonly blendMs: number;
  private readonly random: () => number;

  constructor(options: VariantResolverOptions = {}) {
    this.holdMs = Math.max(0, options.holdMs ?? DEFAULT_HOLD_MS);
    this.blendMs = Math.max(0, options.blendMs ?? DEFAULT_BLEND_MS);
    this.random = options.random ?? Math.random;
  }

  resolve(pose: PoseDefinition | undefined, nowMs: number): PoseDefinition | undefined {
    if (!pose || !pose.variants || pose.variants.length === 0) return pose;
    const variants = pose.variants;
    if (variants.length === 1) {
      return { ...pose, bones: variants[0]?.bones ?? pose.bones };
    }

    let state = this.states.get(pose.id);
    if (!state) {
      const first = this.pick(variants.length, -1);
      state = { from: first, to: first, blendStart: nowMs - this.blendMs, switchAt: nowMs + this.holdMs };
      this.states.set(pose.id, state);
    }

    if (nowMs >= state.switchAt) {
      state.from = state.to;
      state.to = this.pick(variants.length, state.to);
      // 从原定切换时刻开始淡入；长间隔不补播多次，直接把下一次排到未来
      state.blendStart = state.switchAt;
      state.switchAt = state.switchAt + this.holdMs;
      if (nowMs >= state.switchAt) state.switchAt = nowMs + this.holdMs;
    }

    const mix = this.blendMs > 0 ? smoothstep((nowMs - state.blendStart) / this.blendMs) : 1;
    const source = variants[state.from] ?? variants[0];
    const target = variants[state.to] ?? variants[0];
    return {
      ...pose,
      bones: mix >= 1 ? (target?.bones ?? pose.bones) : blendBones(source?.bones ?? pose.bones, target?.bones ?? pose.bones, mix),
    };
  }

  private pick(length: number, avoid: number): number {
    if (length <= 1) return 0;
    let index = Math.floor(this.random() * length);
    index = Math.min(length - 1, Math.max(0, index));
    if (index === avoid) index = (index + 1) % length;
    return index;
  }
}

let sharedResolver: PoseVariantResolver | null = null;

/** 运行时默认解析器；测试可以直接 new PoseVariantResolver 注入随机源 */
export function resolvePoseVariant(
  pose: PoseDefinition | undefined,
  nowMs: number = performance.now(),
): PoseDefinition | undefined {
  sharedResolver ??= new PoseVariantResolver();
  return sharedResolver.resolve(pose, nowMs);
}
