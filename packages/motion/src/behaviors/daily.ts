import type { BehaviorDefinition, BoneMask } from '../contracts';

/**
 * 日常行为（L3）：干饭、伏案工作、醒来伸懒腰。
 *
 * 只组合姿势/动作/表情轨道，不自己起定时器；loop 一直持续到剧本或交互停止。
 */

const EAT_MASK: BoneMask = { include: ['spine', 'head', 'leftArm', 'rightArm'] };
const ALL_BODY: BoneMask = {
  include: ['spine', 'head', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'],
};
const ARMS: BoneMask = { include: ['leftArm', 'rightArm'] };
const LEGS: BoneMask = { include: ['leftLeg', 'rightLeg'] };

/** 干饭：端碗 → 循环送一口，咀嚼表情常驻，结束时放下手 */
export const EAT_RICE: BehaviorDefinition = {
  id: 'behavior.eat-rice',
  priority: 1,
  interrupt: 'all',
  enter: {
    durationMs: 600,
    tracks: [
      { kind: 'pose', mask: EAT_MASK, pose: 'pose.eat-cycle', fadeMs: 600 },
      { kind: 'morph', channels: { 'mouth.chew': 0.4, 'expr.fun': 0.3 } },
    ],
  },
  loop: {
    tracks: [
      { kind: 'pose', mask: EAT_MASK, pose: 'pose.eat-cycle' },
      { kind: 'morph', channels: { 'mouth.chew': 0.7, 'expr.fun': 0.4 } },
    ],
  },
  exit: {
    durationMs: 500,
    tracks: [
      { kind: 'pose', mask: ARMS, pose: 'pose.gesture-hang' },
      { kind: 'pose', mask: ALL_BODY, pose: 'pose.idle-torso', fadeMs: 500 },
    ],
  },
};

/** 伏案：撑桌前倾 + 视线压向桌面 + 思考表情 */
export const WORK_FOCUS: BehaviorDefinition = {
  id: 'behavior.work-focus',
  priority: 2,
  interrupt: 'all',
  enter: {
    durationMs: 600,
    tracks: [
      { kind: 'pose', mask: ALL_BODY, pose: 'pose.lean-desk', fadeMs: 600 },
      { kind: 'look', target: 'down', weight: 0.8 },
      { kind: 'morph', channels: { 'brow.thinking': 0.8 } },
    ],
  },
  loop: {
    tracks: [
      { kind: 'pose', mask: ALL_BODY, pose: 'pose.lean-desk' },
      { kind: 'look', target: 'down', weight: 0.8 },
      { kind: 'morph', channels: { 'brow.thinking': 0.8 } },
    ],
  },
  exit: {
    durationMs: 500,
    tracks: [
      { kind: 'pose', mask: ARMS, pose: 'pose.gesture-hang' },
      { kind: 'pose', mask: ALL_BODY, pose: 'pose.idle-torso', fadeMs: 500 },
    ],
  },
};

/** 醒来：一次伸懒腰（enter 即动作时长）→ 回站姿；循环伸懒腰由剧本再触发 */
export const WAKE: BehaviorDefinition = {
  id: 'behavior.wake',
  priority: 1,
  interrupt: 'all',
  enter: {
    durationMs: 3000,
    tracks: [
      // 手臂沿「垂臂 → 前平举 → 上举」路径，避免横向穿过 T-pose
      { kind: 'pose', mask: ALL_BODY, pose: 'pose.stretch-cycle' },
    ],
  },
  exit: {
    durationMs: 500,
    tracks: [
      { kind: 'pose', mask: ARMS, pose: 'pose.gesture-hang' },
      { kind: 'pose', mask: ALL_BODY, pose: 'pose.idle-torso', fadeMs: 500 },
      { kind: 'pose', mask: LEGS, pose: 'pose.legs-stand' },
    ],
  },
};
