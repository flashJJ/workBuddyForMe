import type { BoneMask, PoseDefinition } from '../contracts';

/**
 * v3.5 T2.5：触摸反应姿态（L1）。
 *
 * 全部是「被摸/被戳/被吓到」时的身体第一反应，幅度克制，
 * 由行为层控制持续时间与回弹；手指细节交给手型动作叠加。
 */

const REACT: BoneMask = { include: ['spine', 'head', 'leftArm', 'rightArm'] };

/**
 * 缩肩环抱：最常见的第一反应；带变体簇，多次被戳的幅度略有差异。
 *
 * v3.0 M1：手臂由 `POSE_EXECUTORS['pose.react-flinch']` 用世界方向求解
 * （大臂向前向外张开、前臂向中线收拢，双手靠近但不交叉）。
 * 这里的欧拉值只是通用消费者的兜底近似，须保持在约束表范围内。
 */
export const REACT_FLINCH: PoseDefinition = {
  id: 'pose.react-flinch',
  mask: REACT,
  bones: {
    spine: { x: 0.14 },
    neck: { x: 0.08 },
    head: { x: 0.1 },
    leftUpperArm: { x: 0.35, z: -0.35 },
    leftLowerArm: { y: 0.35, z: 1.2 },
    leftHand: { z: 0.1 },
    rightUpperArm: { x: 0.35, z: 0.35 },
    rightLowerArm: { y: -0.35, z: -1.2 },
    rightHand: { z: -0.1 },
  },
  variants: [
    {
      bones: {
        spine: { x: 0.11, z: 0.02 },
        neck: { x: 0.06 },
        head: { x: 0.08 },
        leftUpperArm: { x: 0.3, z: -0.3 },
        leftLowerArm: { y: 0.3, z: 1.1 },
        leftHand: { z: 0.08 },
        rightUpperArm: { x: 0.3, z: 0.3 },
        rightLowerArm: { y: -0.3, z: -1.1 },
        rightHand: { z: -0.08 },
      },
    },
    {
      bones: {
        spine: { x: 0.17, z: -0.015 },
        neck: { x: 0.1 },
        head: { x: 0.12 },
        leftUpperArm: { x: 0.4, z: -0.4 },
        leftLowerArm: { y: 0.4, z: 1.3 },
        rightUpperArm: { x: 0.4, z: 0.4 },
        rightLowerArm: { y: -0.4, z: -1.3 },
      },
    },
  ],
};

/** 双手护头：被戳头顶/被吓时的防御姿态 */
export const REACT_GUARD_HEAD: PoseDefinition = {
  id: 'pose.react-guard-head',
  mask: REACT,
  bones: {
    spine: { x: 0.1 },
    neck: { x: 0.08 },
    head: { x: 0.18 },
    leftUpperArm: { x: 0.1, z: 0.45 },
    leftLowerArm: { z: 1.7 },
    leftHand: { z: 0.4 },
    rightUpperArm: { x: 0.1, z: -0.45 },
    rightLowerArm: { z: -1.7 },
    rightHand: { z: -0.4 },
  },
};

/** 后仰躲开：上身后撤，双臂自然外张 */
export const REACT_LEAN_BACK: PoseDefinition = {
  id: 'pose.react-lean-back',
  mask: REACT,
  bones: {
    spine: { x: -0.24 },
    neck: { x: -0.18 },
    head: { x: -0.2 },
    leftUpperArm: { x: 0.05, z: 0.9 },
    rightUpperArm: { x: 0.05, z: -0.9 },
  },
};

/** 向左躲：脊柱侧弯 + 视线偏移，右侧手臂抬起护住 */
export const REACT_DODGE_LEFT: PoseDefinition = {
  id: 'pose.react-dodge-left',
  mask: REACT,
  bones: {
    spine: { z: 0.22, y: 0.08 },
    neck: { z: 0.15 },
    head: { z: 0.2, y: 0.12 },
    leftUpperArm: { z: 0.95 },
    rightUpperArm: { z: -0.7 },
    rightLowerArm: { z: -0.5 },
  },
};

/** 蹭手：头主动偏过去贴手，颈侧弯 */
export const REACT_NUZZLE: PoseDefinition = {
  id: 'pose.react-nuzzle',
  mask: REACT,
  bones: {
    spine: { y: 0.06 },
    neck: { x: 0.08, y: 0.18 },
    head: { x: 0.12, y: 0.38, z: 0.18 },
    leftUpperArm: { z: 1.0 },
    rightUpperArm: { z: -1.0 },
  },
};

/** 惊起：身体一激灵，肩膀抬起、头微后仰 */
export const REACT_STARTLE: PoseDefinition = {
  id: 'pose.react-startle',
  mask: REACT,
  bones: {
    spine: { x: -0.12 },
    neck: { x: -0.1 },
    head: { x: -0.15 },
    leftUpperArm: { x: -0.15, z: 0.7 },
    leftLowerArm: { z: 0.35 },
    rightUpperArm: { x: -0.15, z: -0.7 },
    rightLowerArm: { z: -0.35 },
  },
};
