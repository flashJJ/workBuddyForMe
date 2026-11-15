import type { PoseVariant } from '../contracts';

/**
 * 站姿 / 坐姿的变体簇样本（T2.6 变体机制的正式内容）。
 *
 * 约束（`__tests__/variants/pose-variants.test.ts` 会校验）：
 * - 每个变体的骨骼键必须与基准姿势完全一致，否则切换时缺失骨骼会被当作 0；
 * - 骨骼必须落在基准姿势的 mask 内；
 * - 与基准的差异 ≤0.12 rad，只做「同一姿势的不同站法」，不变成另一个姿势。
 */

/** 重心压左腿的 3 种细微站法（肩线高低 / 右膝松紧不同） */
export const STANCE_WEIGHT_LEFT_VARIANTS: readonly PoseVariant[] = [
  {
    bones: {
      spine: { z: 0.075, y: 0.045 },
      leftUpperLeg: { z: 0.03 },
      rightUpperLeg: { z: 0.08 },
      rightLowerLeg: { x: 0.09 },
    },
  },
  {
    bones: {
      spine: { z: 0.09, y: 0.055 },
      leftUpperLeg: { z: 0.05 },
      rightUpperLeg: { z: 0.06 },
      rightLowerLeg: { x: 0.07 },
    },
  },
  {
    bones: {
      spine: { z: 0.06, y: 0.04 },
      leftUpperLeg: { z: 0.035 },
      rightUpperLeg: { z: 0.085 },
      rightLowerLeg: { x: 0.1 },
    },
  },
];

/** 重心压右腿（与左腿镜像的 3 种站法） */
export const STANCE_WEIGHT_RIGHT_VARIANTS: readonly PoseVariant[] = [
  {
    bones: {
      spine: { z: -0.075, y: -0.045 },
      leftUpperLeg: { z: -0.08 },
      leftLowerLeg: { x: 0.09 },
      rightUpperLeg: { z: -0.03 },
    },
  },
  {
    bones: {
      spine: { z: -0.09, y: -0.055 },
      leftUpperLeg: { z: -0.06 },
      leftLowerLeg: { x: 0.07 },
      rightUpperLeg: { z: -0.05 },
    },
  },
  {
    bones: {
      spine: { z: -0.06, y: -0.04 },
      leftUpperLeg: { z: -0.085 },
      leftLowerLeg: { x: 0.1 },
      rightUpperLeg: { z: -0.035 },
    },
  },
];

/** 坐姿基础：大腿抬角与小腿垂角交替 1~2°，避免每次坐下完全一样 */
export const SIT_READY_VARIANTS: readonly PoseVariant[] = [
  {
    bones: {
      spine: { x: 0.07 },
      neck: { x: 0.045 },
      leftUpperLeg: { x: 1.13 },
      leftLowerLeg: { x: -1.43 },
      leftFoot: { x: -0.09 },
      rightUpperLeg: { x: 1.17 },
      rightLowerLeg: { x: -1.47 },
      rightFoot: { x: -0.11 },
    },
  },
  {
    bones: {
      spine: { x: 0.09 },
      neck: { x: 0.055 },
      leftUpperLeg: { x: 1.17 },
      leftLowerLeg: { x: -1.47 },
      leftFoot: { x: -0.11 },
      rightUpperLeg: { x: 1.13 },
      rightLowerLeg: { x: -1.43 },
      rightFoot: { x: -0.09 },
    },
  },
  {
    bones: {
      spine: { x: 0.075 },
      neck: { x: 0.05 },
      leftUpperLeg: { x: 1.14 },
      leftLowerLeg: { x: -1.46 },
      leftFoot: { x: -0.12 },
      rightUpperLeg: { x: 1.16 },
      rightLowerLeg: { x: -1.44 },
      rightFoot: { x: -0.08 },
    },
  },
];

/** 坐窗沿：后靠角度、双腿垂摆与撑沿手臂各差一点 */
export const SIT_SILL_VARIANTS: readonly PoseVariant[] = [
  {
    bones: {
      spine: { x: -0.05 },
      neck: { x: 0.03 },
      leftUpperLeg: { x: 1.34, z: -0.05 },
      leftLowerLeg: { x: -1.33 },
      leftFoot: { x: -0.13 },
      rightUpperLeg: { x: 1.36, z: 0.05 },
      rightLowerLeg: { x: -1.42 },
      rightFoot: { x: -0.17 },
      leftUpperArm: { x: 0.18, z: 0.48 },
      leftLowerArm: { z: 0.42 },
      rightUpperArm: { x: 0.22, z: -0.52 },
      rightLowerArm: { z: -0.47 },
    },
  },
  {
    bones: {
      spine: { x: -0.07 },
      neck: { x: 0.05 },
      leftUpperLeg: { x: 1.37, z: -0.07 },
      leftLowerLeg: { x: -1.37 },
      leftFoot: { x: -0.17 },
      rightUpperLeg: { x: 1.34, z: 0.05 },
      rightLowerLeg: { x: -1.38 },
      rightFoot: { x: -0.13 },
      leftUpperArm: { x: 0.22, z: 0.52 },
      leftLowerArm: { z: 0.48 },
      rightUpperArm: { x: 0.18, z: -0.48 },
      rightLowerArm: { z: -0.42 },
    },
  },
  {
    bones: {
      spine: { x: -0.055 },
      neck: { x: 0.04 },
      leftUpperLeg: { x: 1.33, z: -0.06 },
      leftLowerLeg: { x: -1.36 },
      leftFoot: { x: -0.14 },
      rightUpperLeg: { x: 1.38, z: 0.07 },
      rightLowerLeg: { x: -1.43 },
      rightFoot: { x: -0.16 },
      leftUpperArm: { x: 0.2, z: 0.47 },
      leftLowerArm: { z: 0.5 },
      rightUpperArm: { x: 0.2, z: -0.53 },
      rightLowerArm: { z: -0.44 },
    },
  },
];

/** 坐桌沿：前倾角度、双腿并拢程度与搭膝双手位置各差一点 */
export const SIT_DESK_VARIANTS: readonly PoseVariant[] = [
  {
    bones: {
      spine: { x: 0.05 },
      neck: { x: 0.04 },
      leftUpperLeg: { x: 1.34, z: 0.02 },
      leftLowerLeg: { x: -1.48 },
      leftFoot: { x: -0.1 },
      rightUpperLeg: { x: 1.36, z: -0.04 },
      rightLowerLeg: { x: -1.52 },
      rightFoot: { x: -0.14 },
      leftUpperArm: { x: 0.26, z: 0.4 },
      leftLowerArm: { z: 0.7 },
      leftHand: { z: 0.1 },
      rightUpperArm: { x: 0.3, z: -0.44 },
      rightLowerArm: { z: -0.74 },
      rightHand: { z: -0.14 },
    },
  },
  {
    bones: {
      spine: { x: 0.07 },
      neck: { x: 0.06 },
      leftUpperLeg: { x: 1.36, z: 0.04 },
      leftLowerLeg: { x: -1.52 },
      leftFoot: { x: -0.14 },
      rightUpperLeg: { x: 1.34, z: -0.02 },
      rightLowerLeg: { x: -1.48 },
      rightFoot: { x: -0.1 },
      leftUpperArm: { x: 0.3, z: 0.44 },
      leftLowerArm: { z: 0.74 },
      leftHand: { z: 0.14 },
      rightUpperArm: { x: 0.26, z: -0.4 },
      rightLowerArm: { z: -0.7 },
      rightHand: { z: -0.1 },
    },
  },
  {
    bones: {
      spine: { x: 0.055 },
      neck: { x: 0.05 },
      leftUpperLeg: { x: 1.33, z: 0.03 },
      leftLowerLeg: { x: -1.49 },
      leftFoot: { x: -0.13 },
      rightUpperLeg: { x: 1.37, z: -0.03 },
      rightLowerLeg: { x: -1.51 },
      rightFoot: { x: -0.11 },
      leftUpperArm: { x: 0.29, z: 0.45 },
      leftLowerArm: { z: 0.68 },
      leftHand: { z: 0.11 },
      rightUpperArm: { x: 0.27, z: -0.42 },
      rightLowerArm: { z: -0.71 },
      rightHand: { z: -0.13 },
    },
  },
];
