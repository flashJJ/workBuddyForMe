import type { RootOffset } from '../contracts';
import { clamp01 } from '../math';

/**
 * root 轨道采样器：只描述场景整体位移，不碰骨骼。
 *
 * 被抓住时角色主体固定在鼠标/窗口位置，不做 yaw/roll 摇摆；
 * 挣扎表现全部交给四肢执行器，避免「抓点也在晃」。
 */
const LIFT_Y = 0.1;

export type RootMotionSampler = (out: RootOffset, ms: number) => void;

export const ROOT_MOTIONS: Readonly<Record<string, RootMotionSampler>> = {
  /** 提起：只做垂直上提 */
  'motion.lift-rise': (out, ms) => {
    out.y += LIFT_Y * clamp01(ms / 80);
  },
  /** 悬空：保持上提高度，主体固定 */
  'motion.lift-hover': (out) => {
    out.y += LIFT_Y;
  },
  /** 放下：垂直回落 */
  'motion.lift-drop': (out, ms) => {
    out.y += LIFT_Y * (1 - clamp01(ms / 75));
  },
};
