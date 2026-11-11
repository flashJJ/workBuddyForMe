import type { BehaviorDefinition, BoneMask, TrackDefinition } from '../contracts';

/**
 * 被拎起：抓取（enter）→ 悬空（loop）→ 释放（exit）。
 * 松开后由 VrmPoseLayer 排队 behavior.land 播放落地缓冲，形成 grab/dangle/release/land 四段。
 */

const ARMS: BoneMask = { include: ['leftArm', 'rightArm'] };
const LEGS: BoneMask = { include: ['leftLeg', 'rightLeg'] };
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

export const LIFTED: BehaviorDefinition = {
  id: 'behavior.lifted',
  priority: 1,
  interrupt: 'all',
  enter: {
    durationMs: 320,
    tracks: [
      { kind: 'pose', mask: TORSO, pose: 'pose.scruff-arch', fadeMs: 320 },
      ...liftTracks('motion.lift-rise'),
    ],
  },
  loop: {
    tracks: liftTracks('motion.lift-hover'),
  },
  exit: {
    durationMs: 300,
    tracks: liftTracks('motion.lift-drop'),
  },
};

/** 落地缓冲：进入即回收，无 loop；与 lifted 同优先级，释放时排队衔接 */
export const LAND: BehaviorDefinition = {
  id: 'behavior.land',
  priority: 1,
  interrupt: 'all',
  enter: {
    durationMs: 320,
    tracks: [{ kind: 'pose', mask: TORSO, pose: 'pose.land-settle', fadeMs: 320 }],
  },
};
