import type { RootOffset } from '../contracts';
import { clamp01 } from '../math';

/**
 * root 轨道采样器：只描述场景整体位移/摆动，不碰骨骼。
 *
 * 与骨架无关的公式放在适配层，motions/ 仍保持纯姿势关键帧；
 * 结果由 VrmAnimationRuntime 按行为权重缩放后交给 VrmPoseLayer 应用。
 */
const LIFT_Y = 0.1;
const SWAY_YAW = 0.07;
const SWAY_ROLL = 0.05;

function sway(out: RootOffset, seconds: number, scale: number): void {
  out.yaw += Math.sin(seconds * 2.2) * SWAY_YAW * scale;
  out.roll += Math.sin(seconds * 1.7) * SWAY_ROLL * scale;
}

export type RootMotionSampler = (out: RootOffset, ms: number) => void;

export const ROOT_MOTIONS: Readonly<Record<string, RootMotionSampler>> = {
  /** 提起：位移与摆动在抓取阶段同步建立 */
  'motion.lift-rise': (out, ms) => {
    const scale = clamp01(ms / 320);
    out.y += LIFT_Y * scale;
    sway(out, ms / 1000, scale);
  },
  /** 悬空：保持上提高度，钟摆持续 */
  'motion.lift-hover': (out, ms) => {
    out.y += LIFT_Y;
    sway(out, ms / 1000, 1);
  },
  /** 放下：位移与摆动随释放阶段收起 */
  'motion.lift-drop': (out, ms) => {
    const scale = 1 - clamp01(ms / 300);
    out.y += LIFT_Y * scale;
    sway(out, ms / 1000, scale);
  },
};
