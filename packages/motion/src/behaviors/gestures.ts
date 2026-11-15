import type { BehaviorDefinition, BoneMask } from '../contracts';

/**
 * P5.5 行为扩容（L3）：鞠躬 / 叉腰 / 托腮 / 打哈欠。
 *
 * bow 与 yawn 只声明 enter：一次性动作结束后 Runner 自动进入 exit；
 * hands-on-hips 与 chin-rest 用 loop 保持，场景结束由适配器 stopBehavior 收尾。
 */

const ALL_BODY: BoneMask = {
  include: ['spine', 'head', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'],
};
const ARMS: BoneMask = { include: ['leftArm', 'rightArm'] };

/** 手势退出：先写垂臂基准，再让目标姿势按权重回落，避免露 A-pose */
function gestureExit(pose: string, durationMs = 400, fadeMs = 500) {
  return {
    durationMs,
    fadeMs,
    tracks: [
      { kind: 'pose' as const, mask: ARMS, pose: 'pose.gesture-hang' },
      { kind: 'pose' as const, mask: ALL_BODY, pose: 'pose.idle-torso', fadeMs: durationMs },
      { kind: 'pose' as const, mask: ALL_BODY, pose },
    ],
  };
}

/** 一次性动作（motion 结束已回站姿）的退出：只回落身体，不再重新摆出目标姿势 */
function settledExit(durationMs = 600, fadeMs = 500) {
  return {
    durationMs,
    fadeMs,
    tracks: [
      { kind: 'pose' as const, mask: ARMS, pose: 'pose.gesture-hang' },
      { kind: 'pose' as const, mask: ALL_BODY, pose: 'pose.idle-torso', fadeMs: durationMs },
    ],
  };
}

/** 自然垂臂基准：手臂轨道返回基线时不要落回 A-pose（交接处会突然跳变） */
const ARMS_HANG = { kind: 'pose' as const, mask: ARMS, pose: 'pose.arms-hang' };

/** 鞠躬：一次前倾回礼，结束后自动回站姿 */
export const BOW: BehaviorDefinition = {
  id: 'behavior.bow',
  priority: 1,
  interrupt: 'all',
  enter: {
    durationMs: 2200,
    fadeMs: 700,
    tracks: [
      ARMS_HANG,
      { kind: 'motion', mask: ALL_BODY, motion: 'motion.bow' },
      { kind: 'morph', channels: { 'expr.joy': 0.3, 'eye.smile': 0.4 } },
    ],
  },
  exit: settledExit(),
};

/** 叉腰：双手扶髋、下巴微抬，保持到场景结束 */
export const HANDS_ON_HIPS: BehaviorDefinition = {
  id: 'behavior.hands-on-hips',
  priority: 2,
  interrupt: 'all',
  enter: {
    durationMs: 800,
    fadeMs: 600,
    tracks: [
      ARMS_HANG,
      { kind: 'pose', mask: ALL_BODY, pose: 'pose.hands-on-hips', fadeMs: 450 },
      { kind: 'morph', channels: { 'brow.smug': 0.7 } },
    ],
  },
  loop: {
    tracks: [
      ARMS_HANG,
      { kind: 'pose', mask: ALL_BODY, pose: 'pose.hands-on-hips' },
      { kind: 'morph', channels: { 'brow.smug': 0.7 } },
    ],
  },
  exit: gestureExit('pose.hands-on-hips', 600, 500),
};

/** 托腮：右手托下巴、头微倾，保持思考状态 */
export const CHIN_REST: BehaviorDefinition = {
  id: 'behavior.chin-rest',
  priority: 2,
  interrupt: 'all',
  enter: {
    durationMs: 900,
    fadeMs: 700,
    tracks: [
      ARMS_HANG,
      { kind: 'pose', mask: ALL_BODY, pose: 'pose.chin-rest', fadeMs: 500 },
      { kind: 'morph', channels: { 'brow.thinking': 0.75 } },
    ],
  },
  loop: {
    tracks: [
      ARMS_HANG,
      { kind: 'pose', mask: ALL_BODY, pose: 'pose.chin-rest' },
      { kind: 'morph', channels: { 'brow.thinking': 0.75 } },
    ],
  },
  exit: gestureExit('pose.chin-rest', 700, 550),
};

/** 打哈欠：一次掩口后仰，结束后自动回站姿 */
export const YAWN: BehaviorDefinition = {
  id: 'behavior.yawn',
  priority: 2,
  interrupt: 'all',
  enter: {
    durationMs: 3000,
    fadeMs: 600,
    tracks: [
      ARMS_HANG,
      { kind: 'motion', mask: ALL_BODY, motion: 'motion.yawn' },
      { kind: 'morph', channels: { 'mouth.o.big': 0.6, 'eye.shy': 0.5 } },
    ],
  },
  exit: settledExit(),
};

/** 拥抱：一次前倾环抱，结束后自动回站姿 */
export const HUG: BehaviorDefinition = {
  id: 'behavior.hug',
  priority: 2,
  interrupt: 'all',
  enter: {
    durationMs: 2800,
    fadeMs: 700,
    tracks: [
      ARMS_HANG,
      { kind: 'motion', mask: ALL_BODY, motion: 'motion.hug' },
      { kind: 'morph', channels: { 'expr.shy': 0.45, 'eye.smile': 0.4 } },
    ],
  },
  exit: settledExit(),
};
