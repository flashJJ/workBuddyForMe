import type { MotionDefinition } from '../contracts';

/**
 * 社交/身体手势（L2）：挥手、害羞、伸懒腰、跺脚。
 *
 * 首尾都回到同一个中立姿势，方便从待机随时插入、播完即可无缝回待机；
 * 左右不对称的动作只让一侧主动，另一侧保持垂臂，避免镜像同帧。
 */

/** 挥手：抬右手 → 手腕内外摆两次 → 放下 */
export const WAVE: MotionDefinition = {
  id: 'motion.wave',
  durationMs: 1900,
  keys: [
    { at: 0, pose: 'pose.arms-hang' },
    { at: 350, pose: 'pose.wave-raised', easing: 'easeOut' },
    { at: 650, pose: 'pose.wave-out', easing: 'easeInOut' },
    { at: 850, pose: 'pose.wave-in', easing: 'easeInOut' },
    { at: 1050, pose: 'pose.wave-out', easing: 'easeInOut' },
    { at: 1250, pose: 'pose.wave-in', easing: 'easeInOut' },
    { at: 1450, pose: 'pose.wave-raised', easing: 'easeInOut' },
    { at: 1900, pose: 'pose.arms-hang', easing: 'easeInOut' },
  ],
};

/** 害羞：低头侧倾、双手交叠身前，停留 1.1s 后回正 */
export const SHY_MOTION: MotionDefinition = {
  id: 'motion.shy',
  durationMs: 2400,
  keys: [
    { at: 0, pose: 'pose.idle-body' },
    { at: 500, pose: 'pose.shy', easing: 'easeOut' },
    { at: 1600, pose: 'pose.shy' },
    { at: 2400, pose: 'pose.idle-body', easing: 'easeInOut' },
  ],
};

/** 伸懒腰：双臂上举、脊柱后展，缓慢起落（工作久坐/刚醒来） */
export const STRETCH_UP: MotionDefinition = {
  id: 'motion.stretch-up',
  durationMs: 3000,
  keys: [
    { at: 0, pose: 'pose.idle-body' },
    { at: 900, pose: 'pose.stance-stretch-up', easing: 'easeInOut' },
    { at: 2000, pose: 'pose.stance-stretch-up' },
    { at: 3000, pose: 'pose.idle-body', easing: 'easeInOut' },
  ],
};

/** 跺脚：提膝 → 踩下 → 回站；只写腿，手臂由行为/待机层决定 */
export const STOMP: MotionDefinition = {
  id: 'motion.stomp',
  durationMs: 1000,
  keys: [
    { at: 0, pose: 'pose.legs-stand' },
    { at: 180, pose: 'pose.stomp-lift', easing: 'easeOut' },
    { at: 340, pose: 'pose.stomp-down', easing: 'easeIn' },
    { at: 620, pose: 'pose.legs-stand', easing: 'easeInOut' },
  ],
};
