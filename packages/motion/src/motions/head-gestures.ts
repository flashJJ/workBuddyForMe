import type { MotionDefinition } from '../contracts';

/**
 * 头部手势（L2）：双次点头 / 摇头 / 环顾。
 *
 * 只写头部姿势，脊柱与视线留给叠加层；持续时长按「微反馈 0.3–0.6s、
 * 手势 0.6–1.2s」的节奏表取，幅度限制在颈部舒适范围内。
 */

/** 双次点头：确认、应和；比单次点头更活泼 */
export const NOD_DOUBLE: MotionDefinition = {
  id: 'motion.nod-double',
  durationMs: 1000,
  keys: [
    { at: 0, pose: 'pose.head-neutral' },
    { at: 140, pose: 'pose.head-down', easing: 'easeOut' },
    { at: 340, pose: 'pose.head-neutral', easing: 'easeInOut' },
    { at: 480, pose: 'pose.head-down', easing: 'easeOut' },
    { at: 680, pose: 'pose.head-neutral', easing: 'easeInOut' },
  ],
};

/** 摇头：否定、拒绝；左右各 17°，中段略带回正 */
export const SHAKE: MotionDefinition = {
  id: 'motion.shake',
  durationMs: 900,
  keys: [
    { at: 0, pose: 'pose.head-neutral' },
    { at: 160, pose: 'pose.head-shake-left', easing: 'easeOut' },
    { at: 340, pose: 'pose.head-shake-right', easing: 'easeInOut' },
    { at: 520, pose: 'pose.head-shake-left', easing: 'easeInOut' },
    { at: 700, pose: 'pose.head-shake-right', easing: 'easeInOut' },
    { at: 900, pose: 'pose.head-neutral', easing: 'easeInOut' },
  ],
};

/** 环顾：左看 → 左上 → 回正 → 右上 → 右看 → 回正 */
export const LOOK_AROUND: MotionDefinition = {
  id: 'motion.look-around',
  durationMs: 2800,
  keys: [
    { at: 0, pose: 'pose.head-neutral' },
    { at: 320, pose: 'pose.head-glance-left', easing: 'easeOut' },
    { at: 720, pose: 'pose.head-look-up-left', easing: 'easeInOut' },
    { at: 1200, pose: 'pose.head-neutral', easing: 'easeInOut' },
    { at: 1600, pose: 'pose.head-look-up-right', easing: 'easeOut' },
    { at: 2050, pose: 'pose.head-glance-right', easing: 'easeInOut' },
    { at: 2800, pose: 'pose.head-neutral', easing: 'easeInOut' },
  ],
};
