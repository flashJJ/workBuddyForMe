import type { BoneMask, PoseDefinition } from '../contracts';
import { ARMS_LIMP } from './arms';
import { LEGS_DANGLE } from './legs';

const LIMBS: BoneMask = { include: ['leftArm', 'rightArm', 'leftLeg', 'rightLeg'] };

/**
 * 被拎起挣扎：静态兜底姿势。
 * 运行时由 `pose.lift-struggle` 执行器按时间驱动四肢摆动，这里只供通用消费者/预览。
 */
export const LIFT_STRUGGLE: PoseDefinition = {
  id: 'pose.lift-struggle',
  mask: LIMBS,
  bones: {
    ...ARMS_LIMP.bones,
    ...LEGS_DANGLE.bones,
  },
};
