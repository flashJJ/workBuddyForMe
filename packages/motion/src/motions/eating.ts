import type { MotionDefinition } from '../contracts';

/**
 * 进食动作（L2）：端碗 → 送一口 → 咀嚼 → 放下，2s 循环。
 *
 * 没有道具，靠手到嘴边 + 头部前倾 + morph 咀嚼通道读成「干饭」；
 * 首尾同为端碗姿势，循环接缝不跳。
 */
export const EAT_BITE_MOTION: MotionDefinition = {
  id: 'motion.eat-bite',
  durationMs: 2000,
  loop: true,
  keys: [
    { at: 0, pose: 'pose.eat-hold' },
    { at: 500, pose: 'pose.eat-bite', easing: 'easeOut' },
    { at: 900, pose: 'pose.eat-bite' },
    { at: 1500, pose: 'pose.eat-hold', easing: 'easeInOut' },
  ],
};
