import * as THREE from 'three';
import { aimBone, orientPalm } from '../../performance/arm-relax';
import type { NormalizedBoneRef } from '../../pose/bones';
import { HANG, type ArmIntent, type ArmPair, type ArmVec } from './intents';

/**
 * 统一手臂求解器：唯一写「大臂方向 + 前臂方向 + 腕 roll」的地方。
 *
 * 所有动作只声明意图（arms/intents.ts），不再各自拼 aimBone/orientPalm；
 * 这样方向与掌心不会互相覆写，新增动作也不会改变其他状态。
 */

const UPPER_WORLD = new THREE.Vector3();
const LOWER_WORLD = new THREE.Vector3();
const PALM_WORLD = new THREE.Vector3();
const HAND_POS = new THREE.Vector3();
const ELBOW_POS = new THREE.Vector3();
const FOREARM = new THREE.Vector3();
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/** 本帧手掌意图：后置叠加改写上臂后，用当前前臂方向重新滚腕 */
interface PalmRoll {
  palm: ArmVec;
  frameYaw: number;
  weight: number;
}
const PALM_ROLLS = new Map<Side, PalmRoll>();

/** 待机微摆：目标方向上的小幅偏移，让放下的手仍有呼吸感 */
const UPPER_SWAY = { x: 0.035, z: 0.05 } as const;
const LOWER_SWAY = { x: 0.045, z: 0.06 } as const;

type Side = 'left' | 'right';

function toWorld(v: ArmVec, frameYaw: number, out: THREE.Vector3): THREE.Vector3 {
  out.set(v[0], v[1], v[2]);
  if (frameYaw !== 0) out.applyAxisAngle(Y_AXIS, frameYaw);
  return out;
}

/**
 * 按世界方向求解一条手臂；weight 控制方向覆盖，lowerWeight 控制前臂与腕 roll。
 * palm 为 null 时不滚腕（交给姿势/动作自身的腕部旋转）。
 */
export function solveArmTargets(
  bones: Map<string, NormalizedBoneRef>,
  side: Side,
  upper: ArmVec,
  lower: ArmVec,
  palm: ArmVec | null,
  weight: number,
  frameYaw = 0,
  lowerWeight = weight,
): void {
  if (weight <= 0) return;
  const upperNode = bones.get(`${side}UpperArm`);
  const lowerNode = bones.get(`${side}LowerArm`);
  const handNode = bones.get(`${side}Hand`);
  if (!upperNode || !lowerNode || !handNode) return;

  aimBone(upperNode.node, lowerNode.node, toWorld(upper, frameYaw, UPPER_WORLD), weight);
  aimBone(lowerNode.node, handNode.node, toWorld(lower, frameYaw, LOWER_WORLD), lowerWeight);
  if (!palm || lowerWeight <= 0) {
    // 明确的「不滚腕」是最终意图，清掉本帧更早的掌心意图
    PALM_ROLLS.delete(side);
    return;
  }

  // 走完方向后再滚腕：掌心法线绕前臂轴旋转，不改变手臂朝向
  handNode.node.getWorldPosition(HAND_POS);
  lowerNode.node.getWorldPosition(ELBOW_POS);
  FOREARM.subVectors(HAND_POS, ELBOW_POS);
  orientPalm(handNode.node, FOREARM, toWorld(palm, frameYaw, PALM_WORLD), lowerWeight);
  PALM_ROLLS.set(side, { palm, frameYaw, weight: lowerWeight });
}

export function solveArm(
  bones: Map<string, NormalizedBoneRef>,
  side: Side,
  intent: ArmIntent,
  weight: number,
  frameYaw = 0,
): void {
  solveArmTargets(bones, side, intent.upper, intent.lower, intent.palm ?? null, weight, frameYaw);
}

export function solveArmPair(
  bones: Map<string, NormalizedBoneRef>,
  pair: ArmPair,
  weight: number,
  frameYaw = 0,
): void {
  solveArm(bones, 'left', pair.left, weight, frameYaw);
  solveArm(bones, 'right', pair.right, weight, frameYaw);
}

/** 自然垂臂 + 呼吸微摆（待机 / 手势退出基准） */
export function solveHangSide(
  bones: Map<string, NormalizedBoneRef>,
  side: Side,
  weight: number,
  t = 0,
  frameYaw = 0,
): void {
  const phase = side === 'left' ? 0 : Math.PI * 0.85;
  const swayX = Math.sin(t * 0.9 + phase);
  const swayZ = Math.cos(t * 0.65 + phase);
  const hang = HANG[side];
  const upper: ArmVec = [
    hang.upper[0] + swayX * UPPER_SWAY.x,
    hang.upper[1],
    hang.upper[2] + swayZ * UPPER_SWAY.z,
  ];
  const lower: ArmVec = [
    hang.lower[0] + swayX * LOWER_SWAY.x,
    hang.lower[1],
    hang.lower[2] + swayZ * LOWER_SWAY.z,
  ];
  solveArmTargets(bones, side, upper, lower, hang.palm ?? null, weight, frameYaw, weight * 0.8);
}

export function solveHang(
  bones: Map<string, NormalizedBoneRef>,
  weight: number,
  t = 0,
  frameYaw = 0,
): void {
  solveHangSide(bones, 'left', weight, t, frameYaw);
  solveHangSide(bones, 'right', weight, t, frameYaw);
}

function lerpVec(from: ArmVec, to: ArmVec, t: number): ArmVec {
  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t,
  ];
}

/** 两个意图之间插值（用于拥抱/干饭等 0→1 进度）；掌心缺失时退回目标意图 */
export function lerpIntent(from: ArmIntent, to: ArmIntent, t: number): ArmIntent {
  const palm = from.palm && to.palm ? lerpVec(from.palm, to.palm, t) : (to.palm ?? from.palm);
  return {
    upper: lerpVec(from.upper, to.upper, t),
    lower: lerpVec(from.lower, to.lower, t),
    palm,
  };
}

/**
 * 手掌必须是手臂子树的最后一个写者。
 *
 * 呼吸/手部防穿模会在手臂求解之后微调上臂；这里用当前前臂方向重新滚腕，
 * 保证掌心朝向不被后置写入带偏。每帧调用一次，调用后清空本帧意图。
 */
export function reapplyPalms(bones: Map<string, NormalizedBoneRef>): void {
  for (const [side, roll] of PALM_ROLLS) {
    const lower = bones.get(`${side}LowerArm`);
    const hand = bones.get(`${side}Hand`);
    if (!lower || !hand) continue;
    hand.node.getWorldPosition(HAND_POS);
    lower.node.getWorldPosition(ELBOW_POS);
    FOREARM.subVectors(HAND_POS, ELBOW_POS);
    orientPalm(hand.node, FOREARM, toWorld(roll.palm, roll.frameYaw, PALM_WORLD), roll.weight);
  }
  PALM_ROLLS.clear();
}
