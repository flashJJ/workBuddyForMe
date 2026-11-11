import type { MotionDefinition } from '../contracts';

/** 点头：下压 → 回正；pose id 由 poses/head.ts 提供 */
export const NOD: MotionDefinition = {
  id: 'motion.nod',
  durationMs: 520,
  keys: [
    { at: 0, pose: 'pose.head-neutral' },
    { at: 160, pose: 'pose.head-down', easing: 'easeOut' },
    { at: 380, pose: 'pose.head-neutral', easing: 'easeInOut' },
  ],
};
