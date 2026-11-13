import type { BehaviorDefinition, BoneMask } from '../contracts';

/**
 * 摸头：被摸头/被夸时的正向反应（L3）。
 *
 * enter 缩脖偏头接受，loop 保持贴手蹭一蹭，exit 回站姿；
 * 表情走语义通道，退出时随行为权重自动淡出。
 */

const HEAD_BODY: BoneMask = { include: ['spine', 'head', 'leftArm', 'rightArm'] };
const ARMS: BoneMask = { include: ['leftArm', 'rightArm'] };

export const HEAD_PAT: BehaviorDefinition = {
  id: 'behavior.head-pat',
  priority: 1,
  interrupt: 'all',
  enter: {
    durationMs: 280,
    tracks: [
      { kind: 'pose', mask: HEAD_BODY, pose: 'pose.react-nuzzle', fadeMs: 280 },
      { kind: 'morph', channels: { 'expr.shy': 0.6, 'eye.smile': 0.5 } },
    ],
  },
  loop: {
    tracks: [
      { kind: 'pose', mask: HEAD_BODY, pose: 'pose.react-nuzzle' },
      { kind: 'morph', channels: { 'expr.joy': 0.7, 'eye.smile': 0.8 } },
    ],
  },
  exit: {
    durationMs: 320,
    tracks: [
      { kind: 'pose', mask: ARMS, pose: 'pose.gesture-hang' },
      { kind: 'pose', mask: HEAD_BODY, pose: 'pose.idle-torso', fadeMs: 320 },
    ],
  },
};
