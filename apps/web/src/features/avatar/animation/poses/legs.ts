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
    leftUpperLeg: { x: -0.18 },
    leftLowerLeg: { x: 0.4 },
    leftFoot: { x: -0.22 },
    rightUpperLeg: { x: -0.18 },
    rightLowerLeg: { x: 0.4 },
    rightFoot: { x: -0.22 },
  },
};
