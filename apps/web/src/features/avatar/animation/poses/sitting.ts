import type { BoneMask, PoseDefinition } from '../contracts';
import { SIT_DESK_VARIANTS, SIT_SILL_VARIANTS } from './variant-samples';

/**
 * v3.5 T2.5 第二批：坐姿变体 / 蹲姿 / 撑桌（L1）。
 *
 * 与 posture.ts 的站姿互补：这批描述「高度差」明显的姿态，
 * 后续坐窗沿、坐桌沿的端点 IK 可以直接以这些姿势为基底。
 *
 * ⚠️ 朝向约定：雪团（VRM0）模型局部前方是 -Z，大腿骨 x 负值会把腿折向身后
 * （实测膝盖 z 变正、脚踝退到髋后）。因此坐姿抬腿用 **x 正值**、小腿回收用 x 负值。
 */

const SIT: BoneMask = { include: ['spine', 'head', 'leftLeg', 'rightLeg'] };
const SIT_WITH_ARMS: BoneMask = {
  include: ['spine', 'head', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'],
};

/** 坐窗沿：身体略后靠，双腿自然垂下，双手撑在沿上 */
export const SIT_SILL: PoseDefinition = {
  id: 'pose.sit-sill',
  mask: SIT_WITH_ARMS,
  bones: {
    spine: { x: -0.06 },
    neck: { x: 0.04 },
    leftUpperLeg: { x: 1.35, z: -0.06 },
    leftLowerLeg: { x: -1.35 },
    leftFoot: { x: -0.15 },
    rightUpperLeg: { x: 1.35, z: 0.06 },
    rightLowerLeg: { x: -1.4 },
    rightFoot: { x: -0.15 },
    leftUpperArm: { x: 0.2, z: 0.5 },
    leftLowerArm: { z: 0.45 },
    rightUpperArm: { x: 0.2, z: -0.5 },
    rightLowerArm: { z: -0.45 },
  },
  variants: SIT_SILL_VARIANTS,
};

/** 坐桌沿：腿并拢垂下，双手搭在膝上，身体略前倾 */
export const SIT_DESK: PoseDefinition = {
  id: 'pose.sit-desk',
  mask: SIT_WITH_ARMS,
  bones: {
    spine: { x: 0.06 },
    neck: { x: 0.05 },
    leftUpperLeg: { x: 1.35, z: 0.03 },
    leftLowerLeg: { x: -1.5 },
    leftFoot: { x: -0.12 },
    rightUpperLeg: { x: 1.35, z: -0.03 },
    rightLowerLeg: { x: -1.5 },
    rightFoot: { x: -0.12 },
    leftUpperArm: { x: 0.28, z: 0.42 },
    leftLowerArm: { z: 0.72 },
    leftHand: { z: 0.12 },
    rightUpperArm: { x: 0.28, z: -0.42 },
    rightLowerArm: { z: -0.72 },
    rightHand: { z: -0.12 },
  },
  variants: SIT_DESK_VARIANTS,
};

/** 盘腿坐：大腿外展下压，小腿内收交叠 */
export const SIT_CROSS_LEGGED: PoseDefinition = {
  id: 'pose.sit-cross-legged',
  mask: SIT_WITH_ARMS,
  bones: {
    spine: { x: 0.04 },
    leftUpperLeg: { x: 0.95, z: -0.4 },
    leftLowerLeg: { x: -1.55, z: 0.55 },
    leftFoot: { x: -0.2 },
    rightUpperLeg: { x: 0.95, z: 0.4 },
    rightLowerLeg: { x: -1.55, z: -0.55 },
    rightFoot: { x: -0.2 },
    leftUpperArm: { x: 0.15, z: 0.85 },
    leftLowerArm: { z: 0.7 },
    rightUpperArm: { x: 0.15, z: -0.85 },
    rightLowerArm: { z: -0.7 },
  },
};

/** 坐地伸腿：双腿前伸、脚背放松，手撑在身后 */
export const SIT_FLOOR: PoseDefinition = {
  id: 'pose.sit-floor',
  mask: SIT_WITH_ARMS,
  bones: {
    spine: { x: -0.04 },
    leftUpperLeg: { x: 1.35, z: -0.05 },
    leftLowerLeg: { x: -0.25 },
    leftFoot: { x: -0.28 },
    rightUpperLeg: { x: 1.35, z: 0.05 },
    rightLowerLeg: { x: -0.25 },
    rightFoot: { x: -0.28 },
    leftUpperArm: { x: -0.2, z: 0.95 },
    leftLowerArm: { z: 0.35 },
    rightUpperArm: { x: -0.2, z: -0.95 },
    rightLowerArm: { z: -0.35 },
  },
};

/** 蹲姿：屈膝下蹲，上身前倾，双臂前伸保持平衡 */
export const CROUCH: PoseDefinition = {
  id: 'pose.crouch',
  mask: SIT_WITH_ARMS,
  bones: {
    spine: { x: 0.24 },
    neck: { x: 0.12 },
    leftUpperLeg: { x: 1.35, z: -0.1 },
    leftLowerLeg: { x: -1.74 },
    leftFoot: { x: 0.35 },
    rightUpperLeg: { x: 1.35, z: 0.1 },
    rightLowerLeg: { x: -1.74 },
    rightFoot: { x: 0.35 },
    leftUpperArm: { x: 0.45, z: 0.62 },
    leftLowerArm: { z: 0.55 },
    rightUpperArm: { x: 0.45, z: -0.62 },
    rightLowerArm: { z: -0.55 },
  },
};

/** 跪坐：小腿贴地折叠，身体直立，双手放腿上 */
export const KNEEL: PoseDefinition = {
  id: 'pose.kneel',
  mask: SIT,
  bones: {
    spine: { x: 0.03 },
    leftUpperLeg: { x: 0.12, z: -0.04 },
    leftLowerLeg: { x: -1.74 },
    leftFoot: { x: -0.4 },
    rightUpperLeg: { x: 0.12, z: 0.04 },
    rightLowerLeg: { x: -1.74 },
    rightFoot: { x: -0.4 },
  },
};

/** 撑桌/伏案：上身大幅前倾，双臂前伸撑住桌面 */
export const LEAN_DESK: PoseDefinition = {
  id: 'pose.lean-desk',
  mask: SIT_WITH_ARMS,
  bones: {
    spine: { x: 0.42 },
    neck: { x: 0.18 },
    head: { x: 0.12 },
    leftUpperLeg: { x: 0.06 },
    leftLowerLeg: { x: -0.2 },
    rightUpperLeg: { x: 0.06 },
    rightLowerLeg: { x: -0.2 },
    leftUpperArm: { x: -0.35, z: 0.6 },
    leftLowerArm: { z: 0.95 },
    leftHand: { z: 0.25 },
    rightUpperArm: { x: -0.35, z: -0.6 },
    rightLowerArm: { z: -0.95 },
    rightHand: { z: -0.25 },
  },
};
