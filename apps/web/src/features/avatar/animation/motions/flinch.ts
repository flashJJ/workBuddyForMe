import type { MotionDefinition } from '../contracts';

/** 被摸/被戳的第一反应（L2）：快速缩肩环抱，短暂停留后回弹。首尾用垂臂锚点，避免空姿势露出绑定 T-pose */
export const REACT_FLINCH_MOTION: MotionDefinition = {
  id: 'motion.react-flinch',
  durationMs: 720,
  keys: [
    { at: 0, pose: 'pose.arms-hang' },
    { at: 120, pose: 'pose.react-flinch', easing: 'easeOut' },
    { at: 360, pose: 'pose.react-flinch' },
    { at: 720, pose: 'pose.arms-hang', easing: 'easeInOut' },
  ],
};
