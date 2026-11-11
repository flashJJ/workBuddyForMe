import type { MotionDefinition } from '../contracts';

/** 瞥一眼：左看 → 回正 → 右看 → 回正 */
export const GLANCE: MotionDefinition = {
  id: 'motion.glance',
  durationMs: 1000,
  keys: [
    { at: 0, pose: 'pose.head-neutral' },
    { at: 180, pose: 'pose.head-glance-left', easing: 'easeOut' },
    { at: 460, pose: 'pose.head-neutral', easing: 'easeInOut' },
    { at: 640, pose: 'pose.head-glance-right', easing: 'easeOut' },
    { at: 1000, pose: 'pose.head-neutral', easing: 'easeInOut' },
  ],
};
