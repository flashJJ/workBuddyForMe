import type { BehaviorDefinition, BoneMask, TrackDefinition } from '../contracts';

/**
 * 被拎起：抓取（enter）→ 悬空（loop）→ 释放（exit）。
 * 松开后由 VrmPoseLayer 排队 behavior.land 播放落地缓冲，形成 grab/dangle/release/land 四段。
 */

const ARMS: BoneMask = { include: ['leftArm', 'rightArm'] };
const LEGS: BoneMask = { include: ['leftLeg', 'rightLeg'] };
const LIMBS: BoneMask = { include: ['leftArm', 'rightArm', 'leftLeg', 'rightLeg'] };
const HEAD: BoneMask = { include: ['head'] };
const TORSO: BoneMask = { include: ['spine'] };

/** 悬空四肢 + 头部 + root；root motion 由适配层采样 */
function liftTracks(rootMotion: string): TrackDefinition[] {
  return [
    { kind: 'root', motion: rootMotion },
    { kind: 'pose', mask: HEAD, pose: 'pose.lift-head' },
    { kind: 'pose', mask: ARMS, pose: 'pose.arms-limp' },
    { kind: 'pose', mask: LEGS, pose: 'pose.legs-dangle' },
  ];
}

/** 被拎起时的表情：进入惊讶，悬空转为生气/挣扎，退出随行为权重淡出 */
const MORPH_ENTER = {
  kind: 'morph',
  channels: { 'brow.surprised': 1, 'mouth.o.big': 0.6 },
} as const;
const MORPH_LOOP = {
  kind: 'morph',
  channels: { 'brow.angry': 0.55, 'eye.angry': 0.35, 'mouth.angry': 0.3 },
} as const;

export const LIFTED: BehaviorDefinition = {
  id: 'behavior.lifted',
  priority: 1,
  interrupt: 'all',
  enter: {
    durationMs: 80,
    fadeMs: 30,
    tracks: [
      { kind: 'pose', mask: TORSO, pose: 'pose.scruff-arch', fadeMs: 80 },
      ...liftTracks('motion.lift-rise'),
      MORPH_ENTER,
    ],
  },
  loop: {
    tracks: [
      { kind: 'root', motion: 'motion.lift-hover' },
      { kind: 'pose', mask: HEAD, pose: 'pose.lift-head' },
      // 按住期间持续挣扎：四肢由执行器按时间交替摆动
      { kind: 'pose', mask: LIMBS, pose: 'pose.lift-struggle' },
      MORPH_LOOP,
    ],
  },
  exit: {
    durationMs: 75,
    fadeMs: 30,
    tracks: [
      // 垂臂基准：退出权重降到 0 时不再回到 A-pose
      { kind: 'pose', mask: ARMS, pose: 'pose.gesture-hang' },
      ...liftTracks('motion.lift-drop'),
      MORPH_LOOP,
    ],
  },
};

/** 落地缓冲：进入即回收，无 loop；与 lifted 同优先级，释放时排队衔接 */
export const LAND: BehaviorDefinition = {
  id: 'behavior.land',
  priority: 1,
  interrupt: 'all',
  enter: {
    durationMs: 80,
    fadeMs: 40,
    tracks: [
      { kind: 'pose', mask: TORSO, pose: 'pose.land-settle', fadeMs: 80 },
      // 落地后手臂回到自然垂臂（从被拎起的姿势按权重过渡）
      { kind: 'pose', mask: ARMS, pose: 'pose.arms-hang' },
    ],
  },
  // 收尾阶段 weight 会降到 0；用不吃权重的基准轨保持垂臂，避免回 A-pose
  exit: {
    durationMs: 30,
    fadeMs: 25,
    tracks: [{ kind: 'pose', mask: ARMS, pose: 'pose.gesture-hang' }],
  },
};
