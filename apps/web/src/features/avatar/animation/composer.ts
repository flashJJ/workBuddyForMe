/**
 * M0c 动效分层库 T1.2：Composer 是唯一决定「谁覆盖谁」的地方。
 *
 * 每帧顺序：写回帧快照（清掉上一帧叠加）→ 按优先级从低到高应用轨道。
 * priority 数值越小优先级越高，因此从 3 递降到 0 写入，低数值最后落盘。
 */

import type { BoneMask, PoseDefinition } from './contracts';
import { applyPose, type PoseLibrary } from './pose';
import type { Skeleton } from './skeleton';

export interface ComposeTrack {
  /** 姿势 id */
  pose?: string;
  /** 运行时合成的姿势（motion 采样结果）；提供时优先于 pose id */
  definition?: PoseDefinition;
  /** 0..1；缺省 1 */
  weight?: number;
  /** 轨道限定的骨骼组，与姿势 mask 取交集 */
  mask?: BoneMask;
  additive?: boolean;
  priority?: 0 | 1 | 2 | 3;
}

export class Composer {
  constructor(
    private readonly skeleton: Skeleton,
    private readonly poses: PoseLibrary,
  ) {}

  /** 合成一帧姿势轨道，返回实际写入的骨骼数 */
  compose(tracks: readonly ComposeTrack[]): number {
    this.skeleton.restoreFrame();
    let written = 0;
    for (let priority = 3; priority >= 0; priority -= 1) {
      for (const track of tracks) {
        if ((track.priority ?? 0) !== priority) continue;
        const pose = track.definition ?? (track.pose ? this.poses.get(track.pose) : undefined);
        if (!pose) continue;
        written += applyPose(this.skeleton, pose, {
          weight: track.weight,
          mask: track.mask,
          additive: track.additive,
        });
      }
    }
    return written;
  }
}
