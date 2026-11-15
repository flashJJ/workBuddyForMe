import type { StageMotionGroup } from '@wbfm/shared/schemas';
import type { StageMotionCue } from './stage-motion-cue';

/**
 * 舞台动作安全白名单：只做头/颈。
 *
 * 舞台的腿脚站姿由 `VrmStageStance` 固定、手指由 daiji 腕轨保持，
 * 全身社交动作（叉腰/托腮/靠墙）会覆盖这两层，正是上一轮手脚扭曲的来源，
 * 因此 v1 不自动接行为；显式 cue 也仅放行已知安全项。
 */
export const STAGE_SAFE_MOTIONS: readonly string[] = [
  'motion.nod',
  'motion.nod-double',
  'motion.tilt',
  'motion.glance',
  'motion.shake',
  'motion.look-around',
];

/** 舞台可用的全身行为：只放行鞠躬这类有明确起止、已验收的动作 */
export const STAGE_SAFE_BEHAVIORS: readonly string[] = ['behavior.bow'];

const GROUP_MOTION: Readonly<Record<StageMotionGroup, string>> = {
  idle: 'motion.nod',
  listening: 'motion.glance',
  thinking: 'motion.tilt',
  working: 'motion.nod-double',
};

export interface StageMotionSource {
  motion: StageMotionGroup;
  motionId?: string;
  behaviorId?: string;
}

/**
 * 台词 cue → 舞台动作。
 * 显式 `motionId` / `behaviorId` 优先；不在白名单时静默回落到分组默认，
 * 动作未注册也不会阻断台词。
 */
export function stageMotionCue(source: StageMotionSource): StageMotionCue {
  if (source.motionId && STAGE_SAFE_MOTIONS.includes(source.motionId)) {
    return { kind: 'motion', id: source.motionId, fadeMs: 160 };
  }
  if (source.behaviorId && STAGE_SAFE_BEHAVIORS.includes(source.behaviorId)) {
    return { kind: 'behavior', id: source.behaviorId };
  }
  return { kind: 'motion', id: GROUP_MOTION[source.motion], fadeMs: 160 };
}
