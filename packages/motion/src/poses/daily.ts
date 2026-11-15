import type { BoneMask, PoseDefinition } from '../contracts';

/**
 * 日常动作姿势（L1）：干饭与 P5.5 行为姿势（鞠躬 / 叉腰 / 托腮 / 打哈欠）。
 *
 * 干饭没有真实碗/筷子道具，靠「双手端在胸前 → 单手送到嘴边」读成进食；
 * 手部细节（握筷/咀嚼）由手型与 morph 通道叠加。
 * 行为姿势只描述身体大形，表情由行为层 morph 轨道叠加。
 */

const EAT_MASK: BoneMask = {
  include: ['spine', 'head', 'leftArm', 'rightArm'],
};

const ALL_BODY: BoneMask = {
  include: ['spine', 'head', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'],
};

/** 干饭循环：运行时由 `pose.eat-cycle` 执行器生成端碗/送口手臂；这里只登记 id */
export const EAT_CYCLE: PoseDefinition = {
  id: 'pose.eat-cycle',
  mask: EAT_MASK,
  bones: {},
};

/** 端碗：双手抬到胸前，手腕向内合拢（手部落点约在胸口中线两侧） */
export const EAT_HOLD: PoseDefinition = {
  id: 'pose.eat-hold',
  mask: EAT_MASK,
  bones: {
    spine: { x: 0.06 },
    neck: { x: 0.04 },
    head: { x: 0.08 },
    leftUpperArm: { x: 1.2, z: 1.2 },
    leftLowerArm: { z: 1.6 },
    leftHand: { z: 0.1 },
    rightUpperArm: { x: 1.2, z: -0.4 },
    rightLowerArm: { z: -1.4 },
    rightHand: { z: -0.1 },
  },
};

/** 送一口：右手抬到嘴边，左手保持端碗 */
export const EAT_BITE: PoseDefinition = {
  id: 'pose.eat-bite',
  mask: EAT_MASK,
  bones: {
    spine: { x: 0.05 },
    neck: { x: 0.05 },
    head: { x: 0.1 },
    leftUpperArm: { x: 1.2, z: 1.2 },
    leftLowerArm: { z: 1.6 },
    leftHand: { z: 0.1 },
    rightUpperArm: { x: 1.6, y: 0.3, z: -0.4 },
    rightLowerArm: { z: -1.8 },
    rightHand: { z: -0.1 },
  },
};

/** 鞠躬：脊柱前倾、颈头随动，双臂自然垂落略前摆 */
export const BOW: PoseDefinition = {
  id: 'pose.bow',
  mask: ALL_BODY,
  bones: {
    spine: { x: 0.36 },
    neck: { x: 0.28 },
    head: { x: 0.18 },
    leftUpperArm: { x: 0.12, z: 1.0 },
    leftLowerArm: { z: 0.18 },
    leftHand: { z: 0.08 },
    rightUpperArm: { x: 0.12, z: -1.0 },
    rightLowerArm: { z: -0.18 },
    rightHand: { z: -0.08 },
    leftUpperLeg: {},
    leftLowerLeg: {},
    leftFoot: {},
    rightUpperLeg: {},
    rightLowerLeg: {},
    rightFoot: {},
  },
};

/** 叉腰：双手扶髋、下巴微抬（手型与生气叉腰一致，情绪由行为 morph 决定） */
export const HANDS_ON_HIPS: PoseDefinition = {
  id: 'pose.hands-on-hips',
  mask: ALL_BODY,
  bones: {
    spine: { x: -0.02 },
    neck: { x: -0.03 },
    head: { x: -0.04, z: 0.08 },
    leftUpperArm: { x: 0.12, z: 0.78 },
    leftLowerArm: { x: 0.2, z: 1.45 },
    leftHand: { z: 0.28 },
    rightUpperArm: { x: 0.12, z: -0.78 },
    rightLowerArm: { x: 0.2, z: -1.45 },
    rightHand: { z: -0.28 },
    leftUpperLeg: {},
    leftLowerLeg: {},
    leftFoot: {},
    rightUpperLeg: {},
    rightLowerLeg: {},
    rightFoot: {},
  },
};

/** 托腮：右手撑住下巴、头向手侧微倾，左手自然垂落 */
export const CHIN_REST: PoseDefinition = {
  id: 'pose.chin-rest',
  mask: ALL_BODY,
  bones: {
    spine: { x: 0.03, z: 0.05 },
    neck: { x: 0.05, z: -0.04 },
    head: { x: 0.08, y: -0.05, z: -0.12 },
    leftUpperArm: { z: 0.98 },
    leftLowerArm: { z: 0.2 },
    leftHand: { z: 0.08 },
    rightUpperArm: { x: 1.35, z: -0.5 },
    rightLowerArm: { x: 0.05, z: -1.75 },
    rightHand: { x: -0.15, z: -0.25 },
    leftUpperLeg: {},
    leftLowerLeg: {},
    leftFoot: {},
    rightUpperLeg: {},
    rightLowerLeg: {},
    rightFoot: {},
  },
};

/** 打哈欠：右手掩口、头后仰、脊柱后展，左臂自然垂落 */
export const YAWN: PoseDefinition = {
  id: 'pose.yawn',
  mask: ALL_BODY,
  bones: {
    spine: { x: -0.1 },
    neck: { x: -0.16 },
    head: { x: -0.14 },
    leftUpperArm: { x: -0.08, z: 1.0 },
    leftLowerArm: { z: 0.15 },
    leftHand: { z: 0.08 },
    rightUpperArm: { x: 1.5, z: -0.3 },
    rightLowerArm: { z: -1.9 },
    rightHand: { x: -0.1, z: -0.2 },
    leftUpperLeg: {},
    leftLowerLeg: {},
    leftFoot: {},
    rightUpperLeg: {},
    rightLowerLeg: {},
    rightFoot: {},
  },
};

/**
 * 拥抱：上身前倾、双臂向前环抱。
 * 手臂欧拉值与 `pose.react-flinch` 的兜底近似同源；运行时若接世界方向执行器可再细化。
 */
export const HUG: PoseDefinition = {
  id: 'pose.hug',
  mask: ALL_BODY,
  bones: {
    spine: { x: 0.1 },
    neck: { x: 0.05 },
    head: { x: 0.06, z: 0.06 },
    leftUpperArm: { x: 0.35, z: -0.35 },
    leftLowerArm: { y: 0.3, z: 1.15 },
    leftHand: { z: 0.12 },
    rightUpperArm: { x: 0.35, z: 0.35 },
    rightLowerArm: { y: -0.3, z: -1.15 },
    rightHand: { z: -0.12 },
    leftUpperLeg: {},
    leftLowerLeg: {},
    leftFoot: {},
    rightUpperLeg: {},
    rightLowerLeg: {},
    rightFoot: {},
  },
};
