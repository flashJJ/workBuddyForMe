/**
 * M0c 动效分层库 T1.2：L1 姿势应用。
 *
 * 姿势只描述「相对绑定姿态的骨骼旋转」；这里负责按 mask 过滤、按 weight 混合，
 * 并区分 additive（叠加在当前帧姿态上）与 override（替换为帧快照 + 偏移）。
 */

import type { BoneMask, BoneQuat, BoneRotation, PoseDefinition } from './contracts';
import { isBoneInMask } from './mask';
import {
  clamp01,
  copyQuat,
  lerp,
  quatFromEuler,
  quatIdentity,
  quatMultiply,
  quatNlerp,
} from './math';
import type { Skeleton } from './skeleton';

export class PoseLibrary {
  private readonly poses = new Map<string, PoseDefinition>();

  constructor(poses: readonly PoseDefinition[] = []) {
    for (const pose of poses) this.poses.set(pose.id, pose);
  }

  get(id: string): PoseDefinition | undefined {
    return this.poses.get(id);
  }

  has(id: string): boolean {
    return this.poses.has(id);
  }

  get size(): number {
    return this.poses.size;
  }
}

export interface ApplyPoseOptions {
  /** 0..1，0 = 保持当前帧姿态 */
  weight?: number;
  /** 轨道 mask，与姿势自身 mask 取交集 */
  mask?: BoneMask;
  /** 覆盖姿势默认 additive 语义 */
  additive?: boolean;
}

/**
 * 两姿势关键帧插值：欧拉分量 lerp，避免「两次叠加」带来的顺序误差。
 * out / scratch 由调用方复用，避免每帧分配。
 */
export function blendPoses(
  poses: PoseLibrary,
  out: PoseDefinition,
  scratch: Map<string, BoneRotation>,
  fromId: string,
  toId: string,
  t: number,
  mask: BoneMask,
): PoseDefinition {
  const from = poses.get(fromId);
  const to = poses.get(toId);
  out.mask = mask;
  out.bones = {};
  const names = new Set<string>([
    ...Object.keys(from?.bones ?? {}),
    ...Object.keys(to?.bones ?? {}),
  ]);
  for (const name of names) {
    const a = from?.bones[name];
    const b = to?.bones[name];
    let rotation = scratch.get(name);
    if (!rotation) {
      rotation = { x: 0, y: 0, z: 0 };
      scratch.set(name, rotation);
    }
    rotation.x = lerp(a?.x ?? 0, b?.x ?? 0, t);
    rotation.y = lerp(a?.y ?? 0, b?.y ?? 0, t);
    rotation.z = lerp(a?.z ?? 0, b?.z ?? 0, t);
    out.bones[name] = rotation;
  }
  return out;
}

const OFFSET: BoneQuat = quatIdentity({ x: 0, y: 0, z: 0, w: 1 });
const CURRENT: BoneQuat = quatIdentity({ x: 0, y: 0, z: 0, w: 1 });
const TARGET: BoneQuat = quatIdentity({ x: 0, y: 0, z: 0, w: 1 });
const OUT: BoneQuat = quatIdentity({ x: 0, y: 0, z: 0, w: 1 });

/** override 的基准：绑定姿态优先，未捕获时退回帧快照/单位元 */
function bindQuat(skeleton: Skeleton, name: string): BoneQuat {
  const base = skeleton.baseOf(name);
  if (base) return copyQuat(CURRENT, base);
  const frame = skeleton.frameOf(name);
  if (frame) return copyQuat(CURRENT, frame);
  return quatIdentity(CURRENT);
}

/** 应用一个姿势，返回实际写入的骨骼数 */
export function applyPose(
  skeleton: Skeleton,
  pose: PoseDefinition,
  options: ApplyPoseOptions = {},
): number {
  const weight = clamp01(options.weight ?? 1);
  if (weight <= 0) return 0;
  const additive = options.additive ?? pose.additive ?? true;
  let written = 0;

  for (const name of Object.keys(pose.bones)) {
    if (!skeleton.has(name)) continue;
    if (!isBoneInMask(pose.mask, name)) continue;
    if (options.mask && !isBoneInMask(options.mask, name)) continue;
    const rotation = pose.bones[name];
    if (!rotation) continue;

    quatFromEuler(OFFSET, rotation.x ?? 0, rotation.y ?? 0, rotation.z ?? 0);
    if (additive) {
      if (!skeleton.read(name, CURRENT)) continue;
    } else {
      bindQuat(skeleton, name);
    }
    quatMultiply(TARGET, OFFSET, CURRENT);
    quatNlerp(OUT, CURRENT, TARGET, weight);
    if (skeleton.write(name, OUT)) written += 1;
  }
  return written;
}
