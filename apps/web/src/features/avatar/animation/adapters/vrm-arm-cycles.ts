import type { NormalizedBoneRef } from '../../pose/bones';
import {
  EAT_BITE_RIGHT,
  EAT_HOLD,
  STRETCH_DOWN,
  STRETCH_FORWARD,
  STRETCH_UP,
} from '../arms/intents';
import { lerpIntent, solveArm } from '../arms/solver';

/**
 * 周期型手臂动作：干饭与伸懒腰。
 *
 * 都按行为内时间驱动「世界方向意图」，经 arms/solver 统一求解；
 * 掌心也随时间插值（前平举掌心朝下、上举朝前），不再一刀切内扣。
 */

function smooth01(value: number): number {
  const t = value < 0 ? 0 : value > 1 ? 1 : value;
  return t * t * (3 - 2 * t);
}

/** 干饭循环：t 为行为内秒数，enter 0.6s 端碗后进入 2s 循环（送一口 → 咀嚼 → 回碗） */
export function aimEatCycle(
  bones: Map<string, NormalizedBoneRef>,
  weight: number,
  t: number,
  frameYaw = 0,
): void {
  const time = Math.max(0, t);
  let bite: number;
  if (time < 0.6) bite = 0;
  else {
    const c = (time - 0.6) % 2.0;
    if (c < 0.5) bite = smooth01(c / 0.5);
    else if (c < 0.9) bite = 1;
    else if (c < 1.5) bite = 1 - smooth01((c - 0.9) / 0.6);
    else bite = 0;
  }
  solveArm(bones, 'left', EAT_HOLD.left, weight, frameYaw);
  solveArm(bones, 'right', lerpIntent(EAT_HOLD.right, EAT_BITE_RIGHT, bite), weight, frameYaw);
}

/** 伸懒腰：t 为行为内秒数；抬臂 0.9s、停留到 2.0s、1.0s 落回 */
export function aimStretchCycle(
  bones: Map<string, NormalizedBoneRef>,
  weight: number,
  t: number,
  frameYaw = 0,
): void {
  if (weight <= 0) return;
  const time = Math.max(0, t);
  let progress: number;
  if (time < 0.9) progress = smooth01(time / 0.9);
  else if (time < 2.0) progress = 1;
  else if (time < 3.0) progress = 1 - smooth01((time - 2.0) / 1.0);
  else progress = 0;

  const first = progress < 0.5;
  const k = smooth01(first ? progress / 0.5 : (progress - 0.5) / 0.5);
  const from = first ? STRETCH_DOWN : STRETCH_FORWARD;
  const to = first ? STRETCH_FORWARD : STRETCH_UP;
  solveArm(bones, 'left', lerpIntent(from.left, to.left, k), weight, frameYaw);
  solveArm(bones, 'right', lerpIntent(from.right, to.right, k), weight, frameYaw);
}
