import type { BoneMask, PoseDefinition } from '../contracts';

/**
 * 手臂姿势：mask 覆盖左右臂。
 *
 * VRM 运行时由 adapters/vrm.ts 的 `pose.arms-hang` 执行器按世界方向求解
 * （与 performance/arm-relax.ts 的旧行为一致）；这里的欧拉值供通用消费者与预览使用。
 */
const ARMS: BoneMask = { include: ['leftArm', 'rightArm'] };

export const ARMS_HANG: PoseDefinition = {
  id: 'pose.arms-hang',
  mask: ARMS,
  bones: {
    leftUpperArm: { z: 1.05 },
    leftLowerArm: { z: 0.16 },
    rightUpperArm: { z: -1.05 },
    rightLowerArm: { z: -0.16 },
  },
};

/** 手势退出基准：始终写自然垂臂（weight 0 也写），避免退出阶段露 A-pose */
export const GESTURE_HANG: PoseDefinition = {
  id: 'pose.gesture-hang',
  mask: ARMS,
  bones: ARMS_HANG.bones,
};

/** 被拎起时的悬空垂臂：比待机更贴近身体，前臂略向前 */
export const ARMS_LIMP: PoseDefinition = {
  id: 'pose.arms-limp',
  mask: ARMS,
  bones: {
    leftUpperArm: { x: 0.1, z: 0.9 },
    leftLowerArm: { x: 0.06, z: 0.25 },
    rightUpperArm: { x: 0.1, z: -0.9 },
    rightLowerArm: { x: 0.06, z: -0.25 },
  },
};

/**
 * 挥手（右手）：上臂抬到耳侧，肘弯向上，左手保持下垂。
 * 角度按归一化骨架实测手部世界坐标反推（手在头侧上方约 5cm）；
 * 三个姿势只让前臂/手腕摆动，避免整条手臂左右甩。
 */
const WAVE_BASE: PoseDefinition['bones'] = {
  leftUpperArm: { z: 1.05 },
  leftLowerArm: { z: 0.16 },
  rightUpperArm: { z: 0.65 },
  rightLowerArm: { z: 0.2 },
};

export const WAVE_RAISED: PoseDefinition = {
  id: 'pose.wave-raised',
  mask: ARMS,
  bones: WAVE_BASE,
};

export const WAVE_OUT: PoseDefinition = {
  id: 'pose.wave-out',
  mask: ARMS,
  bones: {
    ...WAVE_BASE,
    rightUpperArm: { y: -0.1, z: 0.72 },
    rightLowerArm: { z: 0.28 },
    rightHand: { y: -0.2, z: -0.45 },
  },
};

export const WAVE_IN: PoseDefinition = {
  id: 'pose.wave-in',
  mask: ARMS,
  bones: {
    ...WAVE_BASE,
    rightUpperArm: { y: 0.1, z: 0.58 },
    rightLowerArm: { z: 0.12 },
    rightHand: { y: 0.2, z: 0.35 },
  },
};
