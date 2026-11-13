import * as THREE from 'three';
import { aimBone } from '../../performance/arm-relax';
import type { NormalizedBoneRef } from '../../pose/bones';
import { FINGER_SEGMENTS, HAND_RIGHT_CUP_HOLD, HAND_SHAPES, type FingerName } from '../poses/hands';
import type { PoseDefinition } from '../contracts';
import { applyPose } from '../pose';
import { aimEatCycle, aimStretchCycle } from './vrm-arm-cycles';
import { aimLeanDesk, aimLiftStruggle } from './vrm-gesture-arms';
import {
  BOW,
  CHIN_REST_RIGHT,
  HANDS_ON_HIPS,
  HANG, HUG,
  LIFT_ARM,
  PROP_HOLD_RIGHT, SCOLD_HUFF,
  YAWN_RIGHT,
  type ArmVec,
} from '../arms/intents';
import { lerpIntent, solveArm, solveArmPair, solveHang, solveHangSide, solveArmTargets } from '../arms/solver';
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
  /** 额外转身角（弧度）：世界方向目标随身体朝向旋转，背对时不镜像到中线 */
  frameYaw?: number,
) => void;

interface Limb {
  side: 'left' | 'right';
  upper: string;
  lower: string;
  end: string;
  u: readonly [number, number, number];
  l: readonly [number, number, number];
  phase: number;
  w: number;
  /** 有掌心意图时走统一求解器；腿省略 */
  palm?: ArmVec;
}

const LIFT_ARMS: readonly Limb[] = [
  { side: 'left', upper: 'leftUpperArm', lower: 'leftLowerArm', end: 'leftHand', u: [0.28, -1, -0.1], l: [0.1, -1, 0.12], phase: 0, w: 1, palm: LIFT_ARM.left.palm },
  { side: 'right', upper: 'rightUpperArm', lower: 'rightLowerArm', end: 'rightHand', u: [-0.28, -1, -0.1], l: [-0.1, -1, 0.12], phase: 0.9, w: 1, palm: LIFT_ARM.right.palm },
];

const LIFT_LEGS: readonly Limb[] = [
  { side: 'left', upper: 'leftUpperLeg', lower: 'leftLowerLeg', end: 'leftFoot', u: [0.06, -1, 0.3], l: [0.03, -1, -0.2], phase: 0.4, w: 0.8 },
  { side: 'right', upper: 'rightUpperLeg', lower: 'rightLowerLeg', end: 'rightFoot', u: [-0.06, -1, 0.3], l: [-0.03, -1, -0.2], phase: 1.2, w: 0.8 },
];

/**
 * v3.0 M1：点击反应的“向前环抱”。
 * 从垂臂意图插值到拥抱意图（含掌心），避免欧拉插值经过「手臂水平」的中间态。
 */

/** 反应的上身部分（执行器分支不走欧拉，这里单独应用脊柱/头） */
const FLINCH_TORSO: PoseDefinition = {
  id: 'pose.react-flinch.torso',
  mask: { include: ['spine', 'head'] },
  bones: { spine: { x: 0.14 }, neck: { x: 0.08 }, head: { x: 0.1 } },
};
/** 伸懒腰躯干：微微后仰、抬头 */
const STRETCH_TORSO: PoseDefinition = {
  id: 'pose.stretch.torso',
  mask: { include: ['spine', 'head'] },
  bones: { spine: { x: -0.12 }, neck: { x: -0.06 }, head: { x: -0.12 } },
};
/** 干饭躯干：略低头看碗 */
const EAT_TORSO: PoseDefinition = {
  id: 'pose.eat.torso',
  mask: { include: ['spine', 'head'] },
  bones: { spine: { x: 0.06 }, neck: { x: 0.04 }, head: { x: 0.08 } },
};

/** P5.5 手势躯干：大臂保持自然下垂附近，主要方向变化交给小臂 */
const BOW_TORSO: PoseDefinition = {
  id: 'pose.bow.torso',
  mask: { include: ['spine', 'head'] },
  bones: { spine: { x: 0.36 }, neck: { x: 0.28 }, head: { x: 0.18 } },
};
const HIPS_TORSO: PoseDefinition = {
  id: 'pose.hands-on-hips.torso',
  mask: { include: ['spine', 'head'] },
  bones: { spine: { x: -0.02 }, neck: { x: -0.03 }, head: { x: -0.04, z: 0.08 } },
};
const CHIN_TORSO: PoseDefinition = {
  id: 'pose.chin-rest.torso',
  mask: { include: ['spine', 'head'] },
  bones: { spine: { x: 0.03, z: 0.05 }, neck: { x: 0.05, z: -0.04 }, head: { x: 0.08, y: -0.05, z: -0.12 } },
};
const YAWN_TORSO: PoseDefinition = {
  id: 'pose.yawn.torso',
  mask: { include: ['spine', 'head'] },
  bones: { spine: { x: -0.1 }, neck: { x: -0.16 }, head: { x: -0.14 } },
};
const HUG_TORSO: PoseDefinition = {
  id: 'pose.hug.torso',
  mask: { include: ['spine', 'head'] },
  bones: { spine: { x: 0.1 }, neck: { x: 0.05 }, head: { x: 0.06, z: 0.06 } },
};
/** 生气叉腰躯干：上身后仰、下巴抬起；手臂走意图表 */
const SCOLD_TORSO: PoseDefinition = {
  id: 'pose.scold-huff.torso',
  mask: { include: ['spine', 'head'] },
  bones: { spine: { x: -0.06 }, neck: { x: -0.04 }, head: { x: -0.08 } },
};
/** 摸头蹭手：只写头颈偏转；手臂保持垂臂，避免欧拉 z 把手臂甩到侧面 */
const NUZZLE_TORSO: PoseDefinition = { id: 'pose.react-nuzzle.torso', mask: { include: ['spine', 'head'] }, bones: { spine: { y: 0.06 }, neck: { x: 0.08, y: 0.18 }, head: { x: 0.12, y: 0.38, z: 0.18 } } };

const AIM = new THREE.Vector3();
const CURL_AXIS = new THREE.Vector3(0, 0, 1);
const CURL_QUAT = new THREE.Quaternion();

/**
 * 自然手型：直接复用 L1 的 relaxed 手型（MCP / PIP / DIP 逐节微屈）。
 * 归一化骨架的 rest 为 T-pose、掌心朝下，因此手指屈曲轴是局部 Z：
 * 左手 +Z、右手 -Z；手指继承手臂旋转，垂臂后仍指向掌心一侧。
 */
const FINGER_CURLS = HAND_SHAPES.relaxed.fingers;

/** 双手自然微屈；weight 0..1，直接写 base × 屈曲角，避免逐帧累加 */
function curlHands(bones: Map<string, NormalizedBoneRef>, weight: number): void {
  if (weight <= 0) return;
  for (const side of ['left', 'right'] as const) {
    const sign = side === 'left' ? 1 : -1;
    for (const [finger, segments] of Object.entries(FINGER_SEGMENTS)) {
      const curls = FINGER_CURLS[finger as FingerName].curls;
      for (let i = 0; i < segments.length; i += 1) {
        const ref = bones.get(`${side}${segments[i]}`);
        if (!ref) continue;
        CURL_QUAT.setFromAxisAngle(CURL_AXIS, sign * (curls[i] ?? 0) * weight);
        ref.node.quaternion.copy(ref.baseQuat).multiply(CURL_QUAT);
      }
    }
  }
}

function aimLimbs(
  bones: Map<string, NormalizedBoneRef>,
  weight: number,
  t: number,
  limbs: readonly Limb[],
  frameYaw = 0,
): void {
  if (weight <= 0) return;
  for (const limb of limbs) {
    const upper = bones.get(limb.upper);
    const lower = bones.get(limb.lower);
    const end = bones.get(limb.end);
    if (!upper || !lower || !end) continue;
    const sway = Math.sin(t * 1.9 + limb.phase) * 0.03;
    if (limb.palm) {
      solveArmTargets(
        bones,
        limb.side,
        [limb.u[0] + sway, limb.u[1], limb.u[2]],
        [limb.l[0] + sway * 0.6, limb.l[1], limb.l[2]],
        limb.palm,
        weight * limb.w,
        frameYaw,
      );
      continue;
    }
    AIM.set(limb.u[0] + sway, limb.u[1], limb.u[2]);
    aimBone(upper.node, lower.node, AIM, weight * limb.w);
    AIM.set(limb.l[0] + sway * 0.6, limb.l[1], limb.l[2]);
    aimBone(lower.node, end.node, AIM, weight * limb.w);
  }
}

function aimHugArms(
  bones: Map<string, NormalizedBoneRef>,
  progress: number,
  fromHang = true,
  frameYaw = 0,
): void {
  const t = Math.max(0, Math.min(1, progress));
  for (const side of ['left', 'right'] as const) {
    if (fromHang) {
      solveArm(bones, side, lerpIntent(HANG[side], HUG[side], t), 1, frameYaw);
    } else {
      // 行为轨道：从当前基准（上一姿势）直接向拥抱目标过渡
      solveArm(bones, side, HUG[side], t, frameYaw);
    }
  }
}

/**
 * 过渡协议执行器：动作进出时按采样进度在世界方向间插值（0=原始姿态，1=目标姿态）
 */
export const TRANSITION_EXECUTORS: ReadonlySet<string> = new Set([
  'pose.react-flinch',
  'pose.bow',
  'pose.hands-on-hips',
  'pose.chin-rest',
  'pose.yawn',
  'pose.hug',
]);

/**
 * 动作采样段 → 过渡执行器与进度：
 * - 进入（to 是执行器姿势）= t；停留（from=to）= 1；退出（from 是执行器姿势）= 1-t。
 */
export function resolveTransitionExecutor(
  from: string,
  to: string,
  t: number,
): { id: string; progress: number } | null {
  if (TRANSITION_EXECUTORS.has(from)) return { id: from, progress: to === from ? 1 : 1 - t };
  if (TRANSITION_EXECUTORS.has(to)) return { id: to, progress: t };
  return null;
}

export const POSE_EXECUTORS: Readonly<Record<string, PoseExecutor>> = {
  'pose.arms-hang': (_skeleton, bones, weight, t, frameYaw = 0) => {
    // weight 0 表示「让位给 clip 自带手臂动画」，不能强行覆盖
    if (weight <= 0) return;
    solveHang(bones, weight, t, frameYaw);
    curlHands(bones, weight);
  },
  'pose.prop-hold': (skeleton, bones, weight, _t, frameYaw = 0) => { solveArm(bones, 'right', PROP_HOLD_RIGHT, weight, frameYaw); applyPose(skeleton, HAND_RIGHT_CUP_HOLD, { weight, additive: false }); },
  /** 手势退出基准：无论权重都写自然垂臂，供 exit 轨道做回落基准 */
  'pose.gesture-hang': (_skeleton, bones, _weight, _t, frameYaw = 0) => {
    solveHang(bones, 1, 0, frameYaw);
    curlHands(bones, 1);
  },
  'pose.arms-limp': (_skeleton, bones, weight, t, frameYaw = 0) => {
    solveHang(bones, weight, t, frameYaw);
    aimLimbs(bones, weight, t, LIFT_ARMS, frameYaw);
  },
  'pose.legs-dangle': (_skeleton, bones, weight, t, frameYaw = 0) =>
    aimLimbs(bones, weight, t, LIFT_LEGS, frameYaw),
  'pose.lift-struggle': (_skeleton, bones, weight, t, frameYaw = 0) => {
    if (weight <= 0) return;
    aimLiftStruggle(bones, weight, t, frameYaw);
  },
  'pose.react-flinch': (skeleton, bones, weight, _t, frameYaw = 0) => {
    applyPose(skeleton, FLINCH_TORSO, { weight });
    aimHugArms(bones, weight, true, frameYaw);
  },
  'pose.react-nuzzle': (skeleton, bones, weight, _t, frameYaw = 0) => {
    applyPose(skeleton, NUZZLE_TORSO, { weight });
    solveArmPair(bones, HANG, weight, frameYaw);
    curlHands(bones, weight);
  },
  'pose.bow': (skeleton, bones, weight, _t, frameYaw = 0) => {
    applyPose(skeleton, BOW_TORSO, { weight });
    // 躯干前倾时双臂略前摆，双手不要藏到身后
    solveArmPair(bones, BOW, weight, frameYaw);
    curlHands(bones, weight);
  },
  'pose.hands-on-hips': (skeleton, bones, weight, _t, frameYaw = 0) => {
    applyPose(skeleton, HIPS_TORSO, { weight });
    solveArmPair(bones, HANDS_ON_HIPS, weight, frameYaw);
    curlHands(bones, weight);
  },
  'pose.scold-huff': (skeleton, bones, weight, _t, frameYaw = 0) => {
    applyPose(skeleton, SCOLD_TORSO, { weight });
    solveArmPair(bones, SCOLD_HUFF, weight, frameYaw);
    curlHands(bones, weight);
  },
  'pose.chin-rest': (skeleton, bones, weight, _t, frameYaw = 0) => {
    applyPose(skeleton, CHIN_TORSO, { weight });
    solveHangSide(bones, 'left', weight, 0, frameYaw);
    solveArm(bones, 'right', CHIN_REST_RIGHT, weight, frameYaw);
    curlHands(bones, weight);
  },
  'pose.yawn': (skeleton, bones, weight, _t, frameYaw = 0) => {
    applyPose(skeleton, YAWN_TORSO, { weight });
    solveHangSide(bones, 'left', weight, 0, frameYaw);
    solveArm(bones, 'right', YAWN_RIGHT, weight, frameYaw);
    curlHands(bones, weight);
  },
  'pose.hug': (skeleton, bones, weight, _t, frameYaw = 0) => {
    applyPose(skeleton, HUG_TORSO, { weight });
    aimHugArms(bones, weight, false, frameYaw);
    curlHands(bones, weight);
  },
  'pose.lean-desk': (skeleton, bones, weight, _t, frameYaw = 0) =>
    aimLeanDesk(skeleton, bones, weight, frameYaw),
  'pose.stretch-cycle': (skeleton, bones, weight, t, frameYaw = 0) => {
    applyPose(skeleton, STRETCH_TORSO, { weight });
    aimStretchCycle(bones, weight, t, frameYaw);
    curlHands(bones, weight);
  },
  'pose.eat-cycle': (skeleton, bones, weight, t, frameYaw = 0) => {
    applyPose(skeleton, EAT_TORSO, { weight });
    aimEatCycle(bones, weight, t, frameYaw);
    curlHands(bones, weight);
  },
};
