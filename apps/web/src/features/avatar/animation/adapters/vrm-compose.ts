/**
 * 行为轨道 → Composer 轨道的解析（含世界方向执行器优先级）。
 *
 * 放在适配层：只有这里知道 POSE_EXECUTORS 与 motion 采样；
 * vrm.ts 只负责组装 track 列表与逐帧调用。
 */

import type { BoneMask, BoneRotation, PoseDefinition, TrackDefinition } from '../contracts';
import type { ComposeTrack } from '../composer';
import { isBoneInMask } from '../mask';
import { sampleMotion, type MotionLibrary, type MotionSample } from '../motion';
import { blendPoses, type PoseLibrary } from '../pose';
import type { Skeleton } from '../skeleton';
import { POSE_EXECUTORS, resolveTransitionExecutor } from './vrm-executors';

export interface ResolveContext {
  poses: PoseLibrary;
  motions: MotionLibrary;
  sample: MotionSample;
  blended: PoseDefinition;
  blendedBones: Map<string, BoneRotation>;
}

const FULL_BODY: BoneMask = {
  include: ['spine', 'head', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'],
};

/** 单条行为轨道 → Composer 轨道；执行器优先于欧拉姿势与动作混合 */
export function resolveTrack(
  track: TrackDefinition,
  weight: number,
  elapsedMs: number,
  ctx: ResolveContext,
  timeMs = 0,
): ComposeTrack | null {
  const scale = weight * ('weight' in track ? track.weight ?? 1 : 1);
  if (track.kind === 'pose') {
    if (POSE_EXECUTORS[track.pose]) {
      return { executor: { id: track.pose, progress: 1, timeMs }, mask: track.mask, weight: scale };
    }
    return { pose: track.pose, mask: track.mask, weight: scale };
  }
  if (track.kind !== 'motion') return null;

  const motion = ctx.motions.get(track.motion);
  if (!motion) return null;
  const sample = sampleMotion(ctx.sample, motion, elapsedMs, track.at ?? 0);
  const transition = resolveTransitionExecutor(sample.from, sample.to, sample.t);
  if (transition) {
    return { executor: { ...transition, timeMs }, mask: track.mask, weight: scale };
  }
  if (sample.from === sample.to || sample.t <= 0) {
    const pose = sample.t >= 1 ? sample.to : sample.from;
    if (POSE_EXECUTORS[pose]) {
      return { executor: { id: pose, progress: 1, timeMs }, mask: track.mask, weight: scale };
    }
    return { pose, mask: track.mask, weight: scale };
  }
  return {
    definition: blendPoses(
      ctx.poses,
      ctx.blended,
      ctx.blendedBones,
      sample.from,
      sample.to,
      sample.t,
      track.mask,
    ),
    mask: track.mask,
    weight: scale,
  };
}

/** 记录轨道会写入的骨骼；执行器按 mask 记录，行为结束后统一回帧快照 */
export function collectTrackBones(
  track: ComposeTrack,
  skeleton: Skeleton,
  poses: PoseLibrary,
  composedBones: string[],
): void {
  if (track.executor) {
    for (const name of skeleton.namesForMask(track.mask ?? FULL_BODY)) {
      if (!composedBones.includes(name)) composedBones.push(name);
    }
    return;
  }
  const pose = track.definition ?? (track.pose ? poses.get(track.pose) : undefined);
  if (!pose) return;
  for (const name of Object.keys(pose.bones)) {
    if (!skeleton.has(name)) continue;
    if (!isBoneInMask(pose.mask, name)) continue;
    if (track.mask && !isBoneInMask(track.mask, name)) continue;
    if (!composedBones.includes(name)) composedBones.push(name);
  }
}
