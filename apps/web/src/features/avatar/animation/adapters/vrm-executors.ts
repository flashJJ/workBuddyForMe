import * as THREE from 'three';
import { aimBone, relaxBothArms } from '../../performance/arm-relax';
import type { NormalizedBoneRef } from '../../pose/bones';
import type { Skeleton } from '../skeleton';

/**
 * 姿势执行器：局部欧拉无法表达的姿势（世界空间朝向求解）。
 *
 * 垂臂沿用 performance/arm-relax.ts；悬空四肢沿用迁移前的目标方向与相位，
 * 保证迁移前后视觉一致。
 */
export type PoseExecutor = (
  skeleton: Skeleton,
  normBones: Map<string, NormalizedBoneRef>,
  weight: number,
  t: number,
) => void;

interface Limb {
  upper: string;
  lower: string;
  end: string;
  u: readonly [number, number, number];
  l: readonly [number, number, number];
  phase: number;
  w: number;
}

const LIFT_ARMS: readonly Limb[] = [
  { upper: 'leftUpperArm', lower: 'leftLowerArm', end: 'leftHand', u: [0.28, -1, -0.1], l: [0.1, -1, 0.12], phase: 0, w: 1 },
  { upper: 'rightUpperArm', lower: 'rightLowerArm', end: 'rightHand', u: [-0.28, -1, -0.1], l: [-0.1, -1, 0.12], phase: 0.9, w: 1 },
];

const LIFT_LEGS: readonly Limb[] = [
  { upper: 'leftUpperLeg', lower: 'leftLowerLeg', end: 'leftFoot', u: [0.06, -1, 0.3], l: [0.03, -1, -0.2], phase: 0.4, w: 0.8 },
  { upper: 'rightUpperLeg', lower: 'rightLowerLeg', end: 'rightFoot', u: [-0.06, -1, 0.3], l: [-0.03, -1, -0.2], phase: 1.2, w: 0.8 },
];

const AIM = new THREE.Vector3();

function aimLimbs(
  bones: Map<string, NormalizedBoneRef>,
  weight: number,
  t: number,
  limbs: readonly Limb[],
): void {
  if (weight <= 0) return;
  for (const limb of limbs) {
    const upper = bones.get(limb.upper);
    const lower = bones.get(limb.lower);
    const end = bones.get(limb.end);
    if (!upper || !lower || !end) continue;
    const sway = Math.sin(t * 1.9 + limb.phase) * 0.03;
    AIM.set(limb.u[0] + sway, limb.u[1], limb.u[2]);
    aimBone(upper.node, lower.node, AIM, weight * limb.w);
    AIM.set(limb.l[0] + sway * 0.6, limb.l[1], limb.l[2]);
    aimBone(lower.node, end.node, AIM, weight * limb.w);
  }
}

export const POSE_EXECUTORS: Readonly<Record<string, PoseExecutor>> = {
  'pose.arms-hang': (_skeleton, bones, weight, t) => {
    if (weight <= 0) return;
    relaxBothArms((name) => bones.get(name), weight, t);
  },
  'pose.arms-limp': (_skeleton, bones, weight, t) => aimLimbs(bones, weight, t, LIFT_ARMS),
  'pose.legs-dangle': (_skeleton, bones, weight, t) => aimLimbs(bones, weight, t, LIFT_LEGS),
};
