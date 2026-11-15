import type { BehaviorDefinition, BoneMask } from '../contracts';

/**
 * 社交行为（L3）：被叫胖。
 *
 * 流程：惊一下 → 跺脚 + 叉腰生气 → 回站姿；
 * 跺脚只写腿、叉腰只写上身，避免两条轨道在同一骨骼上叠加。
 */

const LEGS: BoneMask = { include: ['leftLeg', 'rightLeg'] };
const ARMS: BoneMask = { include: ['leftArm', 'rightArm'] };
const UPPER: BoneMask = { include: ['spine', 'head', 'leftArm', 'rightArm'] };
const ALL_BODY: BoneMask = {
  include: ['spine', 'head', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'],
};

export const SCOLD_FAT: BehaviorDefinition = {
  id: 'behavior.scold-fat',
  priority: 1,
  interrupt: 'all',
  enter: {
    durationMs: 1400,
    tracks: [
      { kind: 'motion', mask: LEGS, motion: 'motion.stomp' },
      { kind: 'pose', mask: UPPER, pose: 'pose.scold-huff', fadeMs: 300 },
      { kind: 'morph', channels: { 'brow.angry': 0.9, 'mouth.angry': 0.5 } },
    ],
  },
  loop: {
    tracks: [
      { kind: 'pose', mask: UPPER, pose: 'pose.scold-huff' },
      { kind: 'morph', channels: { 'brow.angry': 1, 'mouth.angry': 0.45 } },
    ],
  },
  exit: {
    durationMs: 420,
    tracks: [
      { kind: 'pose', mask: ARMS, pose: 'pose.gesture-hang' },
      { kind: 'pose', mask: ALL_BODY, pose: 'pose.idle-torso', fadeMs: 420 },
    ],
  },
};
