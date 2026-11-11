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
