import type { BoneMask } from '../contracts';
import type { MotionSample } from '../motion';
import { maskIncludes } from '../mask';
import { POSE_ARM_INTENTS } from './pose-intents';
import { lerpIntent, solveArmPair } from './solver';
import type { NormalizedBoneRef } from '../../pose/bones';

/**
 * 动作采样 → 手臂意图：姿势/混合写完之后统一接管手臂。
 * 未登记意图的姿势（手部 fidget、腿部动作等）保持原欧拉路径。
 */
export function applyMotionArmIntent(
  bones: Map<string, NormalizedBoneRef>,
  frameYaw: number,
  sample: MotionSample,
  weight: number,
  mask: BoneMask,
): void {
  if (!maskIncludes(mask, 'leftArm') && !maskIncludes(mask, 'rightArm')) return;
  const from = POSE_ARM_INTENTS[sample.from];
  const to = POSE_ARM_INTENTS[sample.to];
  if (!from || !to) return;
  const t = sample.from === sample.to ? 1 : sample.t;
  solveArmPair(
    bones,
    {
      left: lerpIntent(from.left, to.left, t),
      right: lerpIntent(from.right, to.right, t),
    },
    weight,
    frameYaw,
  );
}
