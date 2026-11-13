import type { MotionDefinition } from '../contracts';

/**
 * v3.0 动效库扩容：站姿类短动作（复用已验收的 L1 姿势）。
 *
 * 首尾一律用显式锚点（垂臂 / 全身立姿），禁止空姿势，
 * 避免 additive=false 时把绑定 T-pose 直接露出来。
 */
function stanceMotion(
  id: string,
  pose: string,
  anchor: string,
  enterMs: number,
  holdMs: number,
): MotionDefinition {
  return {
    id,
    durationMs: enterMs + holdMs + enterMs,
    keys: [
      { at: 0, pose: anchor },
      { at: enterMs, pose, easing: 'easeOut' },
      { at: enterMs + holdMs, pose },
      { at: enterMs + holdMs + enterMs, pose: anchor, easing: 'easeInOut' },
    ],
  };
}

/** 双手交叠身前 */
export const HANDS_FRONT_MOTION = stanceMotion(
  'motion.hands-front',
  'pose.stance-hands-front',
  'pose.arms-hang',
  600,
  2000,
);

/** 手插兜 */
export const HANDS_POCKET_MOTION = stanceMotion(
  'motion.hands-pocket',
  'pose.stance-hands-pocket',
  'pose.idle-body',
  600,
  2200,
);

/** 抱臂 */
export const ARMS_CROSSED_MOTION = stanceMotion(
  'motion.arms-crossed',
  'pose.stance-arms-crossed',
  'pose.arms-hang',
  600,
  2400,
);

/** 靠墙放松 */
export const LEAN_WALL_MOTION = stanceMotion(
  'motion.lean-wall',
  'pose.stance-lean-wall',
  'pose.idle-body',
  700,
  2400,
);

/** 踮脚张望 */
export const TIPTOE_MOTION = stanceMotion(
  'motion.tiptoe',
  'pose.stance-tiptoe',
  'pose.idle-body',
  500,
  1600,
);

/** 鞠躬：站姿 → 前倾 → 停留 → 回站姿（柔和版，首尾用躯干净锚点，手臂走垂臂基准） */
export const BOW_MOTION: MotionDefinition = {
  id: 'motion.bow',
  durationMs: 2200,
  keys: [
    { at: 0, pose: 'pose.idle-torso' },
    { at: 700, pose: 'pose.bow', easing: 'easeInOut' },
    { at: 1400, pose: 'pose.bow' },
    { at: 2200, pose: 'pose.idle-torso', easing: 'easeInOut' },
  ],
};

/** 打哈欠：站姿 → 掩口后仰 → 停留 → 回站姿 */
export const YAWN_MOTION: MotionDefinition = {
  id: 'motion.yawn',
  durationMs: 3000,
  keys: [
    { at: 0, pose: 'pose.idle-torso' },
    { at: 800, pose: 'pose.yawn', easing: 'easeInOut' },
    { at: 2100, pose: 'pose.yawn' },
    { at: 3000, pose: 'pose.idle-torso', easing: 'easeInOut' },
  ],
};

/** 拥抱：垂臂 → 前倾环抱 → 停留 → 回垂臂（首尾用躯干净锚点） */
export const HUG_MOTION: MotionDefinition = {
  id: 'motion.hug',
  durationMs: 2800,
  keys: [
    { at: 0, pose: 'pose.idle-torso' },
    { at: 900, pose: 'pose.hug', easing: 'easeInOut' },
    { at: 1900, pose: 'pose.hug' },
    { at: 2800, pose: 'pose.idle-torso', easing: 'easeInOut' },
  ],
};
