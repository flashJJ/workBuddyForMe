import type { MotionDefinition } from '../contracts';

/**
 * 待机重心换脚（L2，8s 循环）：左 → 中立 → 右 → 中立 → 左。
 * 身体幅度很小，用来替代「站着完全不动」；由待机层或预览面板按需播放。
 */
export const STANCE_SWAY: MotionDefinition = {
  id: 'motion.stance-sway',
  durationMs: 8000,
  loop: true,
  keys: [
    { at: 0, pose: 'pose.stance-weight-left' },
    { at: 2000, pose: 'pose.stance-neutral', easing: 'easeInOut' },
    { at: 4000, pose: 'pose.stance-weight-right', easing: 'easeInOut' },
    { at: 6000, pose: 'pose.stance-neutral', easing: 'easeInOut' },
    { at: 8000, pose: 'pose.stance-weight-left', easing: 'easeInOut' },
  ],
};
