import type { BehaviorDefinition } from '../contracts';

/**
 * 待机：垂臂 + 站姿。
 *
 * 呼吸、头部环境漂移、视线仍由 L0 叠加层负责，不进行为轨道；
 * 这里只声明「身体部件该停在哪」，方便后续按优先级打断与回退。
 */
export const IDLE: BehaviorDefinition = {
  id: 'behavior.idle',
  priority: 3,
  interrupt: 'all',
  loop: {
    tracks: [
      { kind: 'pose', mask: { include: ['leftArm', 'rightArm'] }, pose: 'pose.arms-hang' },
      { kind: 'pose', mask: { include: ['leftLeg', 'rightLeg'] }, pose: 'pose.legs-stand' },
    ],
  },
};
