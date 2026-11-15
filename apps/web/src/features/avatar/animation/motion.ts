/**
 * M0c 动效分层库 T1.3：L2 动作采样。
 *
 * 动作 = 关键帧（时间 → 姿势 id）+ 缓动；这里只做确定性采样，
 * 不决定何时播放。loop 取模、offsetMs 用于左右相位错开。
 */

import type { MotionDefinition } from './contracts';
import { clamp01, ease } from './math';

export class MotionLibrary {
  private readonly motions = new Map<string, MotionDefinition>();

  constructor(motions: readonly MotionDefinition[] = []) {
    for (const motion of motions) this.motions.set(motion.id, motion);
  }

  get(id: string): MotionDefinition | undefined {
    return this.motions.get(id);
  }

  has(id: string): boolean {
    return this.motions.has(id);
  }

  get size(): number {
    return this.motions.size;
  }
}

export interface MotionSample {
  /** 段起点姿势 id */
  from: string;
  /** 段终点姿势 id */
  to: string;
  /** 段内进度 0..1（已应用目标关键帧的 easing） */
  t: number;
  /** 归一化后的时间（毫秒） */
  timeMs: number;
  /** 非循环动作是否已到最后一个关键帧 */
  done: boolean;
}

export function emptySample(out: MotionSample = { from: '', to: '', t: 0, timeMs: 0, done: true }): MotionSample {
  out.from = '';
  out.to = '';
  out.t = 0;
  out.timeMs = 0;
  out.done = true;
  return out;
}

/** 采样动作：out 由调用方复用，避免每帧分配 */
export function sampleMotion(
  out: MotionSample,
  motion: MotionDefinition,
  elapsedMs: number,
  offsetMs = 0,
): MotionSample {
  const keys = motion.keys;
  const duration = motion.durationMs;
  emptySample(out);
  if (keys.length === 0 || !(duration > 0)) return out;

  let time = Math.max(0, elapsedMs) + offsetMs;
  if (!motion.loop) time = Math.max(0, time);

  if (motion.loop) {
    time = ((time % duration) + duration) % duration;
  } else {
    time = Math.min(time, duration);
  }
  out.timeMs = time;

  if (keys.length === 1) {
    const only = keys[0];
    if (only) {
      out.from = only.pose;
      out.to = only.pose;
      out.done = !motion.loop;
    }
    return out;
  }

  let index = 0;
  while (index < keys.length - 1) {
    const next = keys[index + 1];
    if (!next || time < next.at) break;
    index += 1;
  }
  const from = keys[index];
  if (!from) return out;
  out.from = from.pose;
  out.done = !motion.loop && index === keys.length - 1;
  if (out.done) {
    out.to = from.pose;
    return out;
  }

  const to = keys[index + 1];
  if (!to) {
    out.to = from.pose;
    return out;
  }
  const span = to.at - from.at;
  const raw = span > 0 ? clamp01((time - from.at) / span) : 0;
  out.to = to.pose;
  out.t = ease(to.easing ?? 'linear', raw);
  return out;
}
