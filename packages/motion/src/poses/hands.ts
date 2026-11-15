import type { BoneMask, BoneRotation, PoseDefinition } from '../contracts';

/**
 * M0d：手部姿势组件（L1）。
 *
 * 手指在 normalized rig 的 T-pose 下沿 ±X 展开、掌心朝下：
 * - 屈曲（curl）绕局部 Z：左手 +、右手 -；
 * - 张开（spread）绕局部 Y：左手为基准值，右手取反。
 * 数值来自 13-human-pose-reference.md 的自然手型/握拳范围。
 */

export const FINGER_SEGMENTS = {
  thumb: ['ThumbMetacarpal', 'ThumbProximal', 'ThumbDistal'],
  index: ['IndexProximal', 'IndexIntermediate', 'IndexDistal'],
  middle: ['MiddleProximal', 'MiddleIntermediate', 'MiddleDistal'],
  ring: ['RingProximal', 'RingIntermediate', 'RingDistal'],
  little: ['LittleProximal', 'LittleIntermediate', 'LittleDistal'],
} as const;

export type FingerName = keyof typeof FINGER_SEGMENTS;
export type HandShapeName = 'relaxed' | 'fist' | 'open' | 'cup-hold';

export interface FingerPose {
  /** MCP / PIP / DIP 屈曲（弧度） */
  curls: readonly [number, number, number];
  /** 近端张开（弧度，左手基准；右手取反） */
  spread?: number;
}

export interface HandShape {
  /** 腕部掌屈（弧度，左手基准；右手取反） */
  wrist: number;
  fingers: Readonly<Record<FingerName, FingerPose>>;
}

export const HAND_SHAPES: Readonly<Record<HandShapeName, HandShape>> = {
  relaxed: {
    wrist: 0.08,
    fingers: {
      thumb: { curls: [0.14, 0.22, 0.14] },
      index: { curls: [0.24, 0.42, 0.24] },
      middle: { curls: [0.27, 0.46, 0.26] },
      ring: { curls: [0.29, 0.5, 0.28] },
      little: { curls: [0.31, 0.52, 0.3] },
    },
  },
  fist: {
    wrist: 0.14,
    fingers: {
      thumb: { curls: [0.35, 0.55, 0.3] },
      index: { curls: [1.15, 1.55, 0.9] },
      middle: { curls: [1.2, 1.62, 0.95] },
      ring: { curls: [1.25, 1.68, 1.0] },
      little: { curls: [1.3, 1.72, 1.05] },
    },
  },
  open: {
    wrist: 0.02,
    fingers: {
      thumb: { curls: [-0.04, -0.02, -0.02] },
      index: { curls: [-0.08, -0.05, -0.03], spread: -0.1 },
      middle: { curls: [-0.06, -0.04, -0.02] },
      ring: { curls: [-0.04, -0.03, -0.02], spread: 0.07 },
      little: { curls: [-0.02, -0.02, -0.01], spread: 0.14 },
    },
  },
  /** 持杯半握：介于放松与握拳之间，四指包住杯壁，拇指绕到对侧 */
  'cup-hold': {
    wrist: 0.1,
    fingers: {
      thumb: { curls: [0.35, 0.28, 0.16], spread: -0.15 },
      index: { curls: [0.48, 0.62, 0.34] },
      middle: { curls: [0.54, 0.68, 0.38] },
      ring: { curls: [0.58, 0.72, 0.4] },
      little: { curls: [0.62, 0.78, 0.44] },
    },
  },
};

const LEFT: BoneMask = { include: ['leftArm'] };
const RIGHT: BoneMask = { include: ['rightArm'] };

function handBones(side: 'left' | 'right', shape: HandShapeName): Record<string, BoneRotation> {
  const sign = side === 'left' ? 1 : -1;
  const definition = HAND_SHAPES[shape];
  const bones: Record<string, BoneRotation> = {};
  // 持物手型只写手指：腕部朝向由手臂求解器决定，重置手骨会破坏掌心 roll
  if (shape !== 'cup-hold') bones[`${side}Hand`] = { z: sign * definition.wrist };
  for (const [finger, segments] of Object.entries(FINGER_SEGMENTS)) {
    const pose = definition.fingers[finger as FingerName];
    segments.forEach((segment, index) => {
      const rotation: BoneRotation = { z: sign * (pose.curls[index] ?? 0) };
      if (index === 0 && pose.spread) rotation.y = sign * pose.spread;
      bones[`${side}${segment}`] = rotation;
    });
  }
  return bones;
}

function define(side: 'left' | 'right', shape: HandShapeName): PoseDefinition {
  return {
    id: `pose.hand-${side}-${shape}`,
    mask: side === 'left' ? LEFT : RIGHT,
    bones: handBones(side, shape),
  };
}

export const HAND_LEFT_RELAXED = define('left', 'relaxed');
export const HAND_LEFT_FIST = define('left', 'fist');
export const HAND_LEFT_OPEN = define('left', 'open');
export const HAND_LEFT_CUP_HOLD = define('left', 'cup-hold');
export const HAND_RIGHT_RELAXED = define('right', 'relaxed');
export const HAND_RIGHT_FIST = define('right', 'fist');
export const HAND_RIGHT_OPEN = define('right', 'open');
export const HAND_RIGHT_CUP_HOLD = define('right', 'cup-hold');

export const HAND_POSES: readonly PoseDefinition[] = [
  HAND_LEFT_RELAXED,
  HAND_LEFT_FIST,
  HAND_LEFT_OPEN,
  HAND_LEFT_CUP_HOLD,
  HAND_RIGHT_RELAXED,
  HAND_RIGHT_FIST,
  HAND_RIGHT_OPEN,
  HAND_RIGHT_CUP_HOLD,
];

/** 持物姿态：运行时由 pose.prop-hold 执行器接管右臂与手指 */
export const PROP_HOLD: PoseDefinition = {
  id: 'pose.prop-hold',
  mask: { include: ['rightArm'] },
  bones: {},
};
