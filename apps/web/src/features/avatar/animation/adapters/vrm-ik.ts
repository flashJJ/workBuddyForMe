/**
 * M0d：把两骨解析 IK 应用到 VRM normalized rig。
 *
 * 与 performance/arm-relax.ts 一样用世界空间方向求解，不依赖骨骼局部轴；
 * weight < 1 时只转一部分，便于与动作/参考姿态混合。
 */

import * as THREE from 'three';
import { aimBone } from '../../performance/arm-relax';
import type { NormalizedBoneRef } from '../../pose/bones';
import { direction, solveTwoBoneSoft, type Vec3 } from '../ik';

export interface TwoBoneIkOptions {
  /** 上段骨骼名（如 leftUpperArm） */
  upper: string;
  /** 下段骨骼名（如 leftLowerArm） */
  lower: string;
  /** 末端骨骼名（如 leftHand） */
  end: string;
  /** 末端目标（世界空间） */
  target: Vec3;
  /** 弯曲方向参考点（世界空间）；缺省沿用当前关节位置，保持自然弯曲方向 */
  pole?: Vec3;
  /** 0..1，默认 1 */
  weight?: number;
  /** 0..1 软 IK：越大越优先保持当前姿态、允许够不到目标（默认 0 = 硬 IK） */
  relax?: number;
}

const ROOT_POS = new THREE.Vector3();
const JOINT_POS = new THREE.Vector3();
const END_POS = new THREE.Vector3();
const POLE_POS = new THREE.Vector3();
const AIM_TARGET = new THREE.Vector3();

function toVec(vector: THREE.Vector3): Vec3 {
  return { x: vector.x, y: vector.y, z: vector.z };
}

/** 求解并写回 normalized bone；骨骼缺失/长度为零时返回 false */
export function applyTwoBoneIk(
  bones: Map<string, NormalizedBoneRef>,
  options: TwoBoneIkOptions,
): boolean {
  const upper = bones.get(options.upper);
  const lower = bones.get(options.lower);
  const end = bones.get(options.end);
  if (!upper || !lower || !end) return false;

  upper.node.updateWorldMatrix(true, false);
  upper.node.getWorldPosition(ROOT_POS);
  lower.node.updateWorldMatrix(true, false);
  lower.node.getWorldPosition(JOINT_POS);
  end.node.updateWorldMatrix(true, false);
  end.node.getWorldPosition(END_POS);

  const upperLength = ROOT_POS.distanceTo(JOINT_POS);
  const lowerLength = JOINT_POS.distanceTo(END_POS);
  if (!(upperLength > 0) || !(lowerLength > 0)) return false;

  const pole = options.pole
    ? POLE_POS.set(options.pole.x, options.pole.y, options.pole.z)
    : JOINT_POS;
  const solution = solveTwoBoneSoft(
    toVec(ROOT_POS),
    options.target,
    toVec(pole),
    upperLength,
    lowerLength,
    { end: toVec(END_POS), joint: toVec(JOINT_POS), relax: options.relax ?? 0 },
  );
  const weight = Math.max(0, Math.min(1, options.weight ?? 1));
  if (weight <= 0) return true;

  const upperDir = direction(toVec(ROOT_POS), solution.joint);
  if (!upperDir) return false;
  AIM_TARGET.set(upperDir.x, upperDir.y, upperDir.z);
  aimBone(upper.node, lower.node, AIM_TARGET, weight);

  lower.node.updateWorldMatrix(true, false);
  lower.node.getWorldPosition(JOINT_POS);
  const lowerDir = direction(toVec(JOINT_POS), solution.end);
  if (!lowerDir) return true;
  AIM_TARGET.set(lowerDir.x, lowerDir.y, lowerDir.z);
  aimBone(lower.node, end.node, AIM_TARGET, weight);
  return true;
}
