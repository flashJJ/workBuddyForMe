/**
 * M0c 动效分层库 T1.1：L0 纯数学（缓动 / 弹簧 / 钟摆 / 四元数）。
 *
 * 全部为无状态纯函数或显式 out 参数，避免每帧分配；不 import three，
 * 四元数运算与 three 的 XYZ 欧拉序保持一致，adapter 可直接写回骨骼。
 */

import type { BoneQuat, EasingName } from './contracts';

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/** 帧率无关指数平滑：与 30/60/120fps 的收敛速度一致 */
export function smoothDamp(current: number, target: number, lambda: number, dt: number): number {
  if (!(dt > 0) || !(lambda > 0)) return current;
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

const EASINGS: Readonly<Record<EasingName, (t: number) => number>> = {
  linear: (t) => t,
  easeIn: (t) => t * t * t,
  easeOut: (t) => 1 - (1 - t) ** 3,
  easeInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
};

export function ease(name: EasingName, t: number): number {
  return EASINGS[name](clamp01(t));
}

export interface SpringState {
  value: number;
  velocity: number;
}

/** 单帧步进（半隐式欧拉）；dt 上限 1/30，避免挂起恢复时爆冲 */
export function springStep(
  state: SpringState,
  target: number,
  stiffness: number,
  damping: number,
  dt: number,
): SpringState {
  if (!(dt > 0)) return state;
  const step = Math.min(dt, 1 / 30);
  const force = (target - state.value) * stiffness - state.velocity * damping;
  state.velocity += force * step;
  state.value += state.velocity * step;
  return state;
}

/** 钟摆：frequencyHz 次/秒的正弦摆动，phase 用于左右错开 */
export function pendulum(tSec: number, amplitude: number, frequencyHz: number, phase = 0): number {
  return Math.sin(tSec * Math.PI * 2 * frequencyHz + phase) * amplitude;
}

export function quatIdentity(out: BoneQuat): BoneQuat {
  out.x = 0;
  out.y = 0;
  out.z = 0;
  out.w = 1;
  return out;
}

/** 与 three 的 Euler('XYZ') 一致 */
export function quatFromEuler(out: BoneQuat, x = 0, y = 0, z = 0): BoneQuat {
  const c1 = Math.cos(x / 2);
  const c2 = Math.cos(y / 2);
  const c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2);
  const s2 = Math.sin(y / 2);
  const s3 = Math.sin(z / 2);
  out.x = s1 * c2 * c3 + c1 * s2 * s3;
  out.y = c1 * s2 * c3 - s1 * c2 * s3;
  out.z = c1 * c2 * s3 + s1 * s2 * c3;
  out.w = c1 * c2 * c3 - s1 * s2 * s3;
  return out;
}

/** out = a × b（先 b 后 a，与 three 的 multiply 顺序一致） */
export function quatMultiply(out: BoneQuat, a: BoneQuat, b: BoneQuat): BoneQuat {
  const ax = a.x;
  const ay = a.y;
  const az = a.z;
  const aw = a.w;
  const bx = b.x;
  const by = b.y;
  const bz = b.z;
  const bw = b.w;
  out.x = ax * bw + aw * bx + ay * bz - az * by;
  out.y = ay * bw + aw * by + az * bx - ax * bz;
  out.z = az * bw + aw * bz + ax * by - ay * bx;
  out.w = aw * bw - ax * bx - ay * by - az * bz;
  return out;
}

export function quatNormalize(out: BoneQuat): BoneQuat {
  const len = Math.hypot(out.x, out.y, out.z, out.w);
  if (len < 1e-8) return quatIdentity(out);
  const inv = 1 / len;
  out.x *= inv;
  out.y *= inv;
  out.z *= inv;
  out.w *= inv;
  return out;
}

/** 最短路径球面线性插值的廉价近似（nlerp），weight 用于 fade / blend */
export function quatNlerp(out: BoneQuat, a: BoneQuat, b: BoneQuat, weight: number): BoneQuat {
  const t = clamp01(weight);
  if (t === 0) return copyQuat(out, a);
  if (t === 1) return copyQuat(out, b);
  const dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  const sign = dot < 0 ? -1 : 1;
  out.x = a.x + (b.x * sign - a.x) * t;
  out.y = a.y + (b.y * sign - a.y) * t;
  out.z = a.z + (b.z * sign - a.z) * t;
  out.w = a.w + (b.w * sign - a.w) * t;
  return quatNormalize(out);
}

export function copyQuat(out: BoneQuat, from: BoneQuat): BoneQuat {
  out.x = from.x;
  out.y = from.y;
  out.z = from.z;
  out.w = from.w;
  return out;
}
