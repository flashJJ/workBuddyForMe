import type { MotionDefinition } from '../contracts';

/** 歪头：左倾 → 右倾 → 回正 */
export const TILT: MotionDefinition = {
  id: 'motion.tilt',
  durationMs: 900,
  keys: [
    { at: 0, pose: 'pose.head-neutral' },
    { at: 220, pose: 'pose.head-tilt-left', easing: 'easeOut' },
    { at: 560, pose: 'pose.head-tilt-right', easing: 'easeInOut' },
    { at: 900, pose: 'pose.head-neutral', easing: 'easeInOut' },
  ],
};
