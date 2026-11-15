/**
 * M0c 动效分层库 T1.2：Composer 是唯一决定「谁覆盖谁」的地方。
 *
 * 每帧顺序：写回帧快照（清掉上一帧叠加）→ 按优先级从低到高应用轨道。
 * priority 数值越小优先级越高，因此从 3 递降到 0 写入，低数值最后落盘。
 */

import type { BoneMask, PoseDefinition } from './contracts';
import { STAGE_ORDER, stageIndexOf, stageOfBone, type FrameStage } from './frame/ownership';
import { isBoneInMask } from './mask';
import { applyPose, type PoseLibrary } from './pose';
import type { Skeleton } from './skeleton';

export interface ComposeTrack {
  /** 姿势 id */
  pose?: string;
  /** 运行时合成的姿势（motion 采样结果）；提供时优先于 pose id */
  definition?: PoseDefinition;
  /**
   * 世界方向执行器轨道：优先于欧拉姿势；
   * 由适配层注入的回调执行，progress 0=起始方向、1=目标方向，timeMs 驱动持续摆动。
   */
  executor?: { id: string; progress: number; timeMs?: number };
  /** 0..1；缺省 1 */
  weight?: number;
  /** 轨道限定的骨骼组，与姿势 mask 取交集 */
  mask?: BoneMask;
  additive?: boolean;
  priority?: 0 | 1 | 2 | 3;
}

/** 执行器回调：返回 false 表示该 id 没有执行器，回退欧拉姿势 */
export type ComposeExecutor = (id: string, weight: number, progress: number, timeMs: number) => boolean;

/**
 * 轨道归阶段：只要触及手臂子树（arms/hands/fingers），统一归到 `arms`，
 * 保持所有手臂写者的相对 priority；纯躯干/腿/头轨道取各自最晚阶段。
 * 这样手臂求解一定在脊柱/腿之后，又不会把手部轨道拆到不同阶段互相覆盖。
 */
export function stageOfTrack(
  track: ComposeTrack,
  skeleton: Skeleton,
  poses: PoseLibrary,
): FrameStage {
  let latest: FrameStage = 'root';
  let touchesArm = false;
  const raise = (bone: string): void => {
    const stage = stageOfBone(bone);
    if (!stage) return;
    if (stage === 'arms' || stage === 'hands' || stage === 'fingers') {
      touchesArm = true;
      return;
    }
    if (stageIndexOf(stage) > stageIndexOf(latest)) latest = stage;
  };
  const pose = track.definition ?? (track.pose ? poses.get(track.pose) : undefined);
  if (pose) {
    for (const name of Object.keys(pose.bones)) {
      if (!skeleton.has(name)) continue;
      if (!isBoneInMask(pose.mask, name)) continue;
      if (track.mask && !isBoneInMask(track.mask, name)) continue;
      raise(name);
    }
    return touchesArm ? 'arms' : latest;
  }
  if (track.mask) {
    for (const name of skeleton.namesForMask(track.mask)) raise(name);
  }
  return touchesArm ? 'arms' : latest;
}

interface StagedTrack {
  track: ComposeTrack;
  stage: FrameStage;
}

export class Composer {
  constructor(
    private readonly skeleton: Skeleton,
    private readonly poses: PoseLibrary,
    private readonly executor?: ComposeExecutor,
  ) {}

  /** 合成一帧姿势轨道，返回实际写入的骨骼数 */
  compose(tracks: readonly ComposeTrack[]): number {
    this.skeleton.restoreFrame();
    const staged: StagedTrack[] = tracks.map((track) => ({
      track,
      stage: stageOfTrack(track, this.skeleton, this.poses),
    }));
    let written = 0;
    for (const stage of STAGE_ORDER) {
      for (let priority = 3; priority >= 0; priority -= 1) {
        for (const { track, stage: trackStage } of staged) {
          if (trackStage !== stage) continue;
          if ((track.priority ?? 0) !== priority) continue;
          if (track.executor && this.executor) {
            const timeMs = track.executor.timeMs ?? 0;
            if (this.executor(track.executor.id, track.weight ?? 1, track.executor.progress, timeMs)) {
              written += 1;
              continue;
            }
          }
          const pose = track.definition ?? (track.pose ? this.poses.get(track.pose) : undefined);
          if (!pose) continue;
          written += applyPose(this.skeleton, pose, {
            weight: track.weight,
            mask: track.mask,
            additive: track.additive,
          });
        }
      }
    }
    return written;
  }
}
