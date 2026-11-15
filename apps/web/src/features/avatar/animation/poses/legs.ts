import type { BoneMask, PoseDefinition } from '../contracts';

const LEGS: BoneMask = { include: ['leftLeg', 'rightLeg'] };

/** 站姿：保持绑定姿态（空姿势用于显式声明「这一段腿不动」） */
export const LEGS_STAND: PoseDefinition = {
  id: 'pose.legs-stand',
  mask: LEGS,
  bones: {},
};

/** 悬空垂腿：膝盖微屈、脚背下垂，左右同相位由动作层负责 */
export const LEGS_DANGLE: PoseDefinition = {
  id: 'pose.legs-dangle',
  mask: LEGS,
  bones: {
    leftUpperLeg: { x: 0.18 },
    leftLowerLeg: { x: -0.4 },
    leftFoot: { x: 0.22 },
    rightUpperLeg: { x: 0.18 },
    rightLowerLeg: { x: -0.4 },
    rightFoot: { x: 0.22 },
  },
};

/** 跺脚抬起：右腿提膝、踝背屈，左腿支撑（生气/被叫胖） */
export const STOMP_LIFT: PoseDefinition = {
  id: 'pose.stomp-lift',
  mask: LEGS,
  bones: {
    leftUpperLeg: { z: 0.03 },
    rightUpperLeg: { x: 0.6, z: 0.03 },
    rightLowerLeg: { x: -0.8 },
    rightFoot: { x: -0.22 },
  },
};

/** 跺脚落地：右脚踩实、双膝微屈吸收冲击 */
export const STOMP_DOWN: PoseDefinition = {
  id: 'pose.stomp-down',
  mask: LEGS,
  bones: {
    leftUpperLeg: { z: 0.02 },
    leftLowerLeg: { x: -0.12 },
    rightUpperLeg: { z: -0.02 },
    rightLowerLeg: { x: -0.18 },
    rightFoot: { x: 0.05 },
  },
};
