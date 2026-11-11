/**
 * M0c 动效分层库 T1.1：L0 骨骼运行时。
 *
 * 只认 SkeletonBone 读写句柄（adapter 负责包 three 对象），负责绑定姿态快照、
 * 当前姿态读取与写回/重置；不决定覆盖关系（那是 composer 的职责）。
 */

import type { BoneMask, BoneQuat } from './contracts';
import { resolveMask } from './mask';
import { copyQuat, quatIdentity } from './math';

/** 单根骨骼读写句柄；read 写入调用方提供的 out，避免每帧分配 */
export interface SkeletonBone {
  readonly name: string;
  read(out: BoneQuat): BoneQuat;
  write(quat: BoneQuat): void;
}

export class Skeleton {
  private readonly bones = new Map<string, SkeletonBone>();
  private readonly base = new Map<string, BoneQuat>();
  /** mixer/clip 本帧写入的姿态（叠加前快照） */
  private readonly frame = new Map<string, BoneQuat>();
  private readonly scratch: BoneQuat = quatIdentity({ x: 0, y: 0, z: 0, w: 1 });

  constructor(bones: Iterable<SkeletonBone>) {
    for (const bone of bones) this.bones.set(bone.name, bone);
  }

  get size(): number {
    return this.bones.size;
  }

  has(name: string): boolean {
    return this.bones.has(name);
  }

  get(name: string): SkeletonBone | undefined {
    return this.bones.get(name);
  }

  /** 捕获绑定/当前姿态为 base；默认全部，重复调用会刷新 */
  capture(names?: readonly string[]): void {
    this.snapshotInto(this.base, names);
  }

  /** 捕获本帧叠加前的姿态；composer 每帧先 restoreFrame 再写入 */
  captureFrame(names?: readonly string[]): void {
    this.snapshotInto(this.frame, names);
  }

  baseOf(name: string): Readonly<BoneQuat> | undefined {
    return this.base.get(name);
  }

  frameOf(name: string): Readonly<BoneQuat> | undefined {
    return this.frame.get(name);
  }

  /** 读当前姿态到 out；骨骼或 base 不存在时返回 false */
  read(name: string, out: BoneQuat): boolean {
    const bone = this.bones.get(name);
    if (!bone) return false;
    bone.read(out);
    return true;
  }

  write(name: string, quat: BoneQuat): boolean {
    const bone = this.bones.get(name);
    if (!bone) return false;
    bone.write(quat);
    return true;
  }

  /** 恢复绑定姿态；无 base 的骨骼跳过 */
  reset(names?: readonly string[]): void {
    for (const name of names ?? this.base.keys()) {
      const bone = this.bones.get(name);
      const base = this.base.get(name);
      if (bone && base) bone.write(base);
    }
  }

  /** 把帧快照写回，清掉上一帧的叠加（composer 每帧调用） */
  restoreFrame(names?: readonly string[]): void {
    for (const name of names ?? this.frame.keys()) {
      const bone = this.bones.get(name);
      const frame = this.frame.get(name);
      if (bone && frame) bone.write(frame);
    }
  }

  /** 只恢复 mask 命中的骨骼，未声明部分保持现状 */
  resetMask(mask: BoneMask): void {
    this.reset(this.namesForMask(mask));
  }

  /** mask 命中的骨骼中，实际存在于本次绑定里的名单 */
  namesForMask(mask: BoneMask): string[] {
    return resolveMask(mask).filter((name) => this.bones.has(name));
  }

  private snapshotInto(store: Map<string, BoneQuat>, names?: readonly string[]): void {
    for (const name of names ?? this.bones.keys()) {
      const bone = this.bones.get(name);
      if (!bone) continue;
      const snapshot = store.get(name) ?? { x: 0, y: 0, z: 0, w: 1 };
      store.set(name, copyQuat(snapshot, bone.read(this.scratch)));
    }
  }
}
