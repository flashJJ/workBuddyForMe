import type { BoneMask, PoseDefinition } from '../contracts';

/** 头部姿势：角度沿用 gesture.ts 的峰值（弧度），mask 只写 head */
const HEAD: BoneMask = { include: ['head'] };

export const HEAD_NEUTRAL: PoseDefinition = {
  id: 'pose.head-neutral',
  mask: HEAD,
  bones: {},
};

export const HEAD_DOWN: PoseDefinition = {
  id: 'pose.head-down',
  mask: HEAD,
  bones: { head: { x: 0.13 } },
};

export const HEAD_TILT_LEFT: PoseDefinition = {
  id: 'pose.head-tilt-left',
  mask: HEAD,
  bones: { head: { x: 0.02, y: 0.05, z: 0.16 } },
};

export const HEAD_TILT_RIGHT: PoseDefinition = {
  id: 'pose.head-tilt-right',
  mask: HEAD,
  bones: { head: { x: 0.02, y: -0.05, z: -0.16 } },
};

export const HEAD_GLANCE_LEFT: PoseDefinition = {
  id: 'pose.head-glance-left',
  mask: HEAD,
  bones: { head: { x: -0.01, y: 0.11 } },
};

export const HEAD_GLANCE_RIGHT: PoseDefinition = {
  id: 'pose.head-glance-right',
  mask: HEAD,
  bones: { head: { x: -0.01, y: -0.11 } },
};

/**
 * 被拎起时的头部：后仰 + 侧倾 + 少量偏转。
 * 角度按 VRM0（rotateVRM0 后 pitchSign = -1）标定，与迁移前的程序化姿态一致。
 */
export const HEAD_LIFT: PoseDefinition = {
  id: 'pose.lift-head',
  mask: HEAD,
  bones: { head: { x: 0.16, y: 0.06, z: -0.12 } },
};
