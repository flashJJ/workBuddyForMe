import type { BoneMask, PoseDefinition } from '../contracts';
import {
  SIT_READY_VARIANTS,
  STANCE_WEIGHT_LEFT_VARIANTS,
  STANCE_WEIGHT_RIGHT_VARIANTS,
} from './variant-samples';

/**
 * v3.5 T2.5：待机身体姿态（L1）。
 *
 * 与 head/arms/legs 的分工：这些姿势描述「身体整体怎么站/怎么坐」，
 * 只写少量骨骼；动作层可以在此基础上继续叠加头部与手部小动作。
 */

const SPINE: BoneMask = { include: ['spine'] };
const SPINE_AND_LEGS: BoneMask = { include: ['spine', 'head', 'leftLeg', 'rightLeg'] };
const ARMS: BoneMask = { include: ['leftArm', 'rightArm'] };
const ALL_BODY: BoneMask = {
  include: ['spine', 'head', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'],
};

/** 重心压左腿：脊柱微侧倾，双腿一松一紧 */
export const STANCE_WEIGHT_LEFT: PoseDefinition = {
  id: 'pose.stance-weight-left',
  mask: SPINE_AND_LEGS,
  bones: {
    spine: { z: 0.08, y: 0.05 },
    leftUpperLeg: { z: 0.04 },
    rightUpperLeg: { z: 0.07 },
    rightLowerLeg: { x: 0.08 },
  },
  // 待机重心换脚的左端样本：每次循环落点略不同，避免「同一个站姿反复出现」
  variants: STANCE_WEIGHT_LEFT_VARIANTS,
};

/** 重心压右腿（左镜像） */
export const STANCE_WEIGHT_RIGHT: PoseDefinition = {
  id: 'pose.stance-weight-right',
  mask: SPINE_AND_LEGS,
  bones: {
    spine: { z: -0.08, y: -0.05 },
    leftUpperLeg: { z: -0.07 },
    leftLowerLeg: { x: 0.08 },
    rightUpperLeg: { z: -0.04 },
  },
  variants: STANCE_WEIGHT_RIGHT_VARIANTS,
};

/** 双手交叠身前：上臂略前收，前臂内收 */
export const STANCE_HANDS_FRONT: PoseDefinition = {
  id: 'pose.stance-hands-front',
  mask: ARMS,
  bones: {
    leftUpperArm: { x: 0.18, z: 0.85 },
    leftLowerArm: { z: 0.85 },
    leftHand: { z: 0.1 },
    rightUpperArm: { x: 0.18, z: -0.85 },
    rightLowerArm: { z: -0.85 },
    rightHand: { z: -0.1 },
  },
};

/** 抱臂：上臂贴近躯干，前臂横叠 */
export const STANCE_ARMS_CROSSED: PoseDefinition = {
  id: 'pose.stance-arms-crossed',
  mask: ARMS,
  bones: {
    leftUpperArm: { x: 0.12, z: 0.62 },
    leftLowerArm: { z: 1.25 },
    leftHand: { z: 0.35 },
    rightUpperArm: { x: 0.12, z: -0.62 },
    rightLowerArm: { z: -1.25 },
    rightHand: { z: -0.35 },
  },
};

/** 手插兜：上臂后收、前臂下压 */
export const STANCE_HANDS_POCKET: PoseDefinition = {
  id: 'pose.stance-hands-pocket',
  mask: ALL_BODY,
  bones: {
    spine: { x: 0.03 },
    leftUpperArm: { x: 0.08, z: 0.72 },
    leftLowerArm: { z: 0.55 },
    leftHand: { z: 0.15 },
    rightUpperArm: { x: 0.08, z: -0.72 },
    rightLowerArm: { z: -0.55 },
    rightHand: { z: -0.15 },
  },
};

/** 伸懒腰收势：双臂上举成 V 形、脊柱后展 */
export const STANCE_STRETCH_UP: PoseDefinition = {
  id: 'pose.stance-stretch-up',
  mask: ALL_BODY,
  bones: {
    spine: { x: -0.12 },
    neck: { x: -0.06 },
    head: { x: -0.12 },
    leftUpperArm: { x: -0.3, z: -0.9 },
    leftLowerArm: { z: 0 },
    rightUpperArm: { x: -0.3, z: 0.9 },
    rightLowerArm: { z: 0 },
  },
};

/** 伸懒腰：运行时由 `pose.stretch-cycle` 执行器按时间生成手臂路径；这里只登记 id */
export const STRETCH_CYCLE: PoseDefinition = {
  id: 'pose.stretch-cycle',
  mask: { include: ['spine', 'head'] },
  bones: {},
};

/** 靠墙：上背后靠，一条腿屈膝放松 */
export const STANCE_LEAN_WALL: PoseDefinition = {
  id: 'pose.stance-lean-wall',
  mask: SPINE_AND_LEGS,
  bones: {
    spine: { x: -0.1, z: 0.05 },
    neck: { x: 0.04 },
    leftUpperLeg: { x: 0.15 },
    leftLowerLeg: { x: -0.3 },
    leftFoot: { x: -0.1 },
    rightUpperLeg: { x: -0.02 },
  },
};

/** 踮脚张望：双脚前掌着力，身体略前探 */
export const STANCE_TIPTOE: PoseDefinition = {
  id: 'pose.stance-tiptoe',
  mask: SPINE_AND_LEGS,
  bones: {
    spine: { x: 0.05 },
    neck: { x: 0.03 },
    leftFoot: { x: 0.35 },
    rightFoot: { x: 0.35 },
  },
};

/** 坐姿基础：大腿前抬、小腿下垂，给坐窗沿/坐桌沿的 IK 与动作做基底 */
export const SIT_READY: PoseDefinition = {
  id: 'pose.sit-ready',
  mask: SPINE_AND_LEGS,
  bones: {
    spine: { x: 0.08 },
    neck: { x: 0.05 },
    leftUpperLeg: { x: 1.15 },
    leftLowerLeg: { x: -1.45 },
    leftFoot: { x: -0.1 },
    rightUpperLeg: { x: 1.15 },
    rightLowerLeg: { x: -1.45 },
    rightFoot: { x: -0.1 },
  },
  variants: SIT_READY_VARIANTS,
};

/** 仅声明「脊柱中立」，用于需要显式覆盖上一条姿势的场合 */
export const STANCE_NEUTRAL: PoseDefinition = {
  id: 'pose.stance-neutral',
  mask: SPINE,
  bones: {},
};

/**
 * 全身中立：垂臂 + 站直 + 头/腿归零。
 *
 * 动作/行为需要一个「从站姿出发、再回到站姿」的锚点时用它；
 * 与 arms-hang 的区别是显式写头与腿，退出时不残留上一条姿势。
 */
export const IDLE_BODY: PoseDefinition = {
  id: 'pose.idle-body',
  mask: ALL_BODY,
  bones: {
    spine: {},
    neck: {},
    head: {},
    leftUpperArm: { z: 1.05 },
    leftLowerArm: { z: 0.16 },
    leftHand: { z: 0.08 },
    rightUpperArm: { z: -1.05 },
    rightLowerArm: { z: -0.16 },
    rightHand: { z: -0.08 },
    leftUpperLeg: {},
    leftLowerLeg: {},
    leftFoot: {},
    rightUpperLeg: {},
    rightLowerLeg: {},
    rightFoot: {},
  },
};

/** 躯干中立：只归零脊柱/头/腿，手臂交给垂臂基准或目标姿势，避免与 arms-hang 叠加 */
export const IDLE_TORSO: PoseDefinition = {
  id: 'pose.idle-torso',
  mask: { include: ['spine', 'head', 'leftLeg', 'rightLeg'] },
  bones: {
    spine: {},
    neck: {},
    head: {},
    leftUpperLeg: {},
    leftLowerLeg: {},
    leftFoot: {},
    rightUpperLeg: {},
    rightLowerLeg: {},
    rightFoot: {},
  },
};

/** 害羞：低头侧倾 + 双手在身前交握（左右手落在中线附近，手腕略内扣） */
export const SHY: PoseDefinition = {
  id: 'pose.shy',
  mask: ALL_BODY,
  bones: {
    spine: { x: 0.1, z: 0.05 },
    neck: { x: 0.06 },
    head: { x: 0.14, y: -0.08, z: 0.16 },
    leftUpperArm: { x: 1.2, z: 1.4 },
    leftLowerArm: { z: 1.6 },
    leftHand: { z: 0.1 },
    rightUpperArm: { x: 1.2, z: -0.4 },
    rightLowerArm: { z: -1.8 },
    rightHand: { z: -0.1 },
    leftUpperLeg: {},
    leftLowerLeg: {},
    leftFoot: {},
    rightUpperLeg: {},
    rightLowerLeg: {},
    rightFoot: {},
  },
};

/** 生气叉腰：双手扶髋、上身后仰、下巴抬起 */
export const SCOLD_HUFF: PoseDefinition = {
  id: 'pose.scold-huff',
  mask: ALL_BODY,
  bones: {
    spine: { x: -0.06 },
    neck: { x: -0.04 },
    head: { x: -0.08 },
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
