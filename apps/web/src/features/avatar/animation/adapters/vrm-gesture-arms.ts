import * as THREE from 'three';
import { aimBone } from '../../performance/arm-relax';
import type { BoneMask } from '../contracts';
import { applyPose } from '../pose';
import { LEAN_DESK as LEAN_DESK_POSE } from '@wbfm/motion/poses';
import type { Skeleton } from '../skeleton';
import type { NormalizedBoneRef } from '../../pose/bones';
import { LEAN_DESK, LIFT_ARM, type ArmVec } from '../arms/intents';
import { solveArmPair, solveArmTargets } from '../arms/solver';

type Side = 'left' | 'right';

const FINGER_QUAT = new THREE.Quaternion();
const FINGER_CURL_AXIS = new THREE.Vector3(0, 0, 1);
const FINGER_SPREAD_AXIS = new THREE.Vector3(0, 1, 0);
const legAim = new THREE.Vector3();

/** 伏案：手臂前伸撑桌，避免欧拉叠加把双手甩到身后 */
const LEAN_BODY_MASK: BoneMask = { include: ['spine', 'head', 'leftLeg', 'rightLeg'] };

export function aimLeanDesk(
  skeleton: Skeleton,
  bones: Map<string, NormalizedBoneRef>,
  weight: number,
  frameYaw = 0,
): void {
  if (weight <= 0) return;
  applyPose(skeleton, LEAN_DESK_POSE, { weight, mask: LEAN_BODY_MASK });
  solveArmPair(bones, LEAN_DESK, weight, frameYaw);
}

/** 悬空时四指协调同伸（同一包络），拇指单独节律 */
const FOUR_FINGERS = [
  { name: 'Index', curls: [0.24, 0.42, 0.24] },
  { name: 'Middle', curls: [0.27, 0.46, 0.26] },
  { name: 'Ring', curls: [0.29, 0.5, 0.28] },
  { name: 'Little', curls: [0.31, 0.52, 0.3] },
] as const;
const FINGER_SEGMENTS = ['Proximal', 'Intermediate', 'Distal'] as const;
const THUMB_SEGMENTS = ['ThumbMetacarpal', 'ThumbProximal', 'ThumbDistal'] as const;
const THUMB_CURLS = [0.14, 0.22, 0.14] as const;
const CURL_AMP = [0.3, 0.42, 0.24] as const;

/**
 * 悬空手指：四指像真实松手一样协调伸缩，拇指用不同频率独立动。
 * 相对 baseQuat 写入，避免逐帧累加。
 */
function animateFingers(
  bones: Map<string, NormalizedBoneRef>,
  side: Side,
  weight: number,
  t: number,
  phase: number,
): void {
  const sign = side === 'left' ? 1 : -1;
  FOUR_FINGERS.forEach((finger, fingerIndex) => {
    const wave = Math.sin(t * 7.2 + phase * 0.5 - fingerIndex * 0.08);
    FINGER_SEGMENTS.forEach((segment, i) => {
      const ref = bones.get(`${side}${finger.name}${segment}`);
      if (!ref) return;
      const angle = ((finger.curls[i] ?? 0) + (CURL_AMP[i] ?? 0) * wave) * weight;
      FINGER_QUAT.setFromAxisAngle(FINGER_CURL_AXIS, sign * angle);
      ref.node.quaternion.copy(ref.baseQuat).multiply(FINGER_QUAT);
    });
  });
  const thumbWave = Math.sin(t * 9.4 + phase * 1.7);
  THUMB_SEGMENTS.forEach((segment, i) => {
    const ref = bones.get(`${side}${segment}`);
    if (!ref) return;
    const angle = ((THUMB_CURLS[i] ?? 0) + (CURL_AMP[i] ?? 0) * thumbWave) * weight;
    FINGER_QUAT.setFromAxisAngle(FINGER_CURL_AXIS, sign * angle);
    ref.node.quaternion.copy(ref.baseQuat).multiply(FINGER_QUAT);
  });
  const metacarpal = bones.get(`${side}ThumbMetacarpal`);
  if (metacarpal) {
    const spread = Math.sin(t * 5.1 + phase) * 0.12 * weight;
    FINGER_QUAT.setFromAxisAngle(FINGER_SPREAD_AXIS, sign * spread);
    metacarpal.node.quaternion.multiply(FINGER_QUAT);
  }
}

/**
 * 被拎起挣扎：悬空四肢多轴摆动，t 为秒；快频多相位，避免同频正弦像正步走。
 * 手臂走统一求解器（方向 + 掌心），腿只做方向对齐。
 */
export function aimLiftStruggle(
  bones: Map<string, NormalizedBoneRef>,
  weight: number,
  t: number,
  frameYaw = 0,
): void {
  const sides = [
    ['left', 'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 0],
    ['right', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot', Math.PI],
  ] as const;
  for (const [side, upperLegName, lowerLegName, footName, phase] of sides) {
    const sign = side === 'left' ? 1 : -1;
    const swayX = Math.sin(t * 6.8 + phase);
    const swayZ = Math.sin(t * 5.2 + phase * 0.8);
    const sway2 = Math.sin(t * 11.6 + phase * 1.6);
    const palm = LIFT_ARM[side].palm ?? null;
    const upperArm: ArmVec = [
      sign * (0.24 + swayX * 0.12 + sway2 * 0.05),
      -0.92 + Math.sin(t * 8.4 + phase) * 0.06,
      0.02 + swayZ * 0.16 + Math.sin(t * 13.2 + phase) * 0.06,
    ];
    const lowerArm: ArmVec = [
      sign * (0.05 + Math.sin(t * 9.2 + phase * 1.2) * 0.1),
      -0.7 + Math.sin(t * 7.6 + phase) * 0.2,
      0.18 + Math.cos(t * 10.4 + phase) * 0.22,
    ];
    solveArmTargets(bones, side, upperArm, lowerArm, palm, weight, frameYaw, weight * 0.8);

    const upperLeg = bones.get(upperLegName);
    const lowerLeg = bones.get(lowerLegName);
    const foot = bones.get(footName);
    if (upperLeg && lowerLeg && foot) {
      aimBone(upperLeg.node, lowerLeg.node, legAim.set(
        sign * (0.08 + Math.sin(t * 5.6 + phase * 1.1) * 0.08),
        -1,
        0.18 + Math.sin(t * 7.2 + phase * 1.3) * 0.24 + Math.cos(t * 12.4 + phase) * 0.08,
      ), weight);
      aimBone(lowerLeg.node, foot.node, legAim.set(
        sign * (0.05 + Math.sin(t * 11.6 + phase) * 0.1),
        -1,
        -0.12 + Math.cos(t * 8.8 + phase) * 0.24 + Math.sin(t * 14 + phase) * 0.1,
      ), weight);
    }
    animateFingers(bones, side, weight, t, phase);
  }
}
