import type { BehaviorDefinition } from '../contracts';

/** 睡眠：低头 + 垂臂；呼吸减速与闭眼仍由姿态/脸层按 sleeping 标记处理 */
export const SLEEP: BehaviorDefinition = {
  id: 'behavior.sleep',
  priority: 2,
  interrupt: 'all',
  enter: {
    durationMs: 600,
    tracks: [
      { kind: 'pose', mask: { include: ['head'] }, pose: 'pose.head-down', fadeMs: 600 },
    ],
  },
  loop: {
    tracks: [
      { kind: 'pose', mask: { include: ['head'] }, pose: 'pose.head-down' },
      { kind: 'pose', mask: { include: ['leftArm', 'rightArm'] }, pose: 'pose.arms-hang' },
    ],
  },
  exit: {
    durationMs: 500,
    tracks: [
      { kind: 'pose', mask: { include: ['head'] }, pose: 'pose.head-neutral', fadeMs: 500 },
    ],
  },
};
