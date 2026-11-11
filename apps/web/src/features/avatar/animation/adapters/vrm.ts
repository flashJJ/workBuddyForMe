/**
 * M0c T1.5/T1.6：VRM 适配层。
 *
 * animation/ 目录里唯一允许 import three 的位置：把 normalized bone 包成 Skeleton 句柄，
 * 把行为轨道展开成 Composer 可消费的姿势轨道，并采样 root 轨道（场景位移/摆动）。
 */

import * as THREE from 'three';
import type {
  BoneMask,
  BoneQuat,
  BoneRotation,
  PoseDefinition,
  RootOffset,
  TrackDefinition,
} from '../contracts';
import { BehaviorLibrary, BehaviorRunner, type RunnerSnapshot } from '../behavior';
import { Composer, type ComposeTrack } from '../composer';
import { isBoneInMask } from '../mask';
import { MotionLibrary, emptySample, sampleMotion, type MotionSample } from '../motion';
import { BehaviorObserver } from '../observability';
import { applyPose, blendPoses, PoseLibrary } from '../pose';
import { Skeleton, type SkeletonBone } from '../skeleton';
import { BEHAVIORS } from '../behaviors';
import { MOTIONS } from '../motions';
import { POSES } from '../poses';
import { POSE_EXECUTORS, type PoseExecutor } from './vrm-executors';
import { ROOT_MOTIONS } from './vrm-root';
import type { NormalizedBoneRef } from '../../pose/bones';

/** normal bone → Skeleton 读写句柄（read 复用调用方 out，不分配） */
export function createVrmSkeleton(normBones: Map<string, NormalizedBoneRef>): Skeleton {
  const bones: SkeletonBone[] = [];
  for (const ref of normBones.values()) {
    const node: THREE.Object3D = ref.node;
    bones.push({
      name: ref.name,
      read(out: BoneQuat): BoneQuat {
        out.x = node.quaternion.x;
        out.y = node.quaternion.y;
        out.z = node.quaternion.z;
        out.w = node.quaternion.w;
        return out;
      },
      write(quat: BoneQuat): void {
        node.quaternion.set(quat.x, quat.y, quat.z, quat.w);
      },
    });
  }
  return new Skeleton(bones);
}

const RUNTIME_MASK: BoneMask = { include: [] };
export class VrmAnimationRuntime {
  readonly skeleton: Skeleton;
  readonly poses: PoseLibrary;
  readonly motions: MotionLibrary;
  readonly behaviors: BehaviorLibrary;
  readonly runner: BehaviorRunner;
  /** T1.8：行为观测（阶段切换环形记录 + 轨道权重快照） */
  readonly observer = new BehaviorObserver();
  /** root 轨道输出（场景整体位移/摆动），由 VrmPoseLayer 每帧读取 */
  readonly root: RootOffset = { y: 0, yaw: 0, roll: 0 };

  private readonly composer: Composer;
  private readonly normBones: Map<string, NormalizedBoneRef>;
  private readonly tracks: ComposeTrack[] = [];
  private readonly sample: MotionSample = emptySample();
  private readonly blendedBones = new Map<string, BoneRotation>();
  private readonly blended: PoseDefinition = {
    id: 'pose.__runtime',
    mask: RUNTIME_MASK,
    bones: {},
  };
  /** 本次行为会话占用的骨骼：捕获帧快照前先回绑定姿态，避免逐帧累加 */
  private readonly composedBones: string[] = [];
  private composed = false;

  constructor(normBones: Map<string, NormalizedBoneRef>) {
    this.normBones = normBones;
    this.skeleton = createVrmSkeleton(normBones);
    this.poses = new PoseLibrary(POSES);
    this.motions = new MotionLibrary(MOTIONS);
    this.behaviors = new BehaviorLibrary(BEHAVIORS);
    this.runner = new BehaviorRunner(this.behaviors);
    this.composer = new Composer(this.skeleton, this.poses);
  }

  captureBase(): void {
    this.skeleton.capture();
  }

  captureFrame(): void {
    if (this.composedBones.length > 0) this.skeleton.reset(this.composedBones);
    this.skeleton.captureFrame();
  }

  get active(): boolean {
    return this.runner.active;
  }
  get snapshot(): Readonly<RunnerSnapshot> {
    return this.runner.snapshot;
  }

  /** T1.8：当前行为 id/阶段/轨道权重与最近过渡 */
  get debug() {
    return this.observer.snapshot(this.runner);
  }

  play(id: string): boolean {
    return this.runner.play(id);
  }

  stop(): boolean {
    return this.runner.stop();
  }

  /** 推进行为时钟并合成；dtMs = 0 冻结。返回写入骨骼数 */
  update(dtMs: number): number {
    this.runner.update(dtMs);
    this.observer.sample(this.runner);
    if (this.runner.active) return this.compose();
    if (!this.composed) return 0;
    this.composed = false;
    this.skeleton.restoreFrame();
    this.skeleton.reset(this.composedBones);
    this.composedBones.length = 0;
    this.root.y = 0;
    this.root.yaw = 0;
    this.root.roll = 0;
    return 0;
  }

  /** 按当前阶段轨道合成；无行为时清空轨道并写回帧快照 */
  compose(): number {
    this.tracks.length = 0;
    this.root.y = 0;
    this.root.yaw = 0;
    this.root.roll = 0;
    this.composed = this.runner.active;
    if (this.runner.active) {
      const weight = this.runner.weight;
      const elapsed = this.runner.phaseElapsedMs;
      for (const track of this.runner.tracks) {
        if (track.kind === 'root') {
          ROOT_MOTIONS[track.motion]?.(this.root, elapsed);
          continue;
        }
        const composed = this.resolve(track, weight, elapsed);
        if (composed) {
          this.tracks.push(composed);
          this.collectBones(composed);
        }
      }
      this.root.y *= weight;
      this.root.yaw *= weight;
      this.root.roll *= weight;
    }
    return this.composer.compose(this.tracks);
  }

  /** 单姿势执行器（垂臂/悬空四肢）；没有执行器时走通用 applyPose */
  applyPose(id: string, weight: number, t = 0): number {
    const executor: PoseExecutor | undefined = POSE_EXECUTORS[id];
    if (executor) {
      executor(this.skeleton, this.normBones, weight, t);
      return 1;
    }
    const pose = this.poses.get(id);
    return pose ? applyPose(this.skeleton, pose, { weight }) : 0;
  }

  /** 记录会被写入的骨骼（过滤规则与 applyPose 一致），整个行为会话内不清空 */
  private collectBones(track: ComposeTrack): void {
    const pose = track.definition ?? (track.pose ? this.poses.get(track.pose) : undefined);
    if (!pose) return;
    for (const name of Object.keys(pose.bones)) {
      if (!this.skeleton.has(name)) continue;
      if (!isBoneInMask(pose.mask, name)) continue;
      if (track.mask && !isBoneInMask(track.mask, name)) continue;
      if (!this.composedBones.includes(name)) this.composedBones.push(name);
    }
  }

  /** 轨道 → ComposeTrack；expression/look 由 T1.7 接管 */
  private resolve(track: TrackDefinition, weight: number, elapsedMs: number): ComposeTrack | null {
    const scale = weight * ('weight' in track ? track.weight ?? 1 : 1);
    if (track.kind === 'pose') {
      return { pose: track.pose, mask: track.mask, weight: scale };
    }
    if (track.kind === 'motion') {
      const motion = this.motions.get(track.motion);
      if (!motion) return null;
      const sample = sampleMotion(this.sample, motion, elapsedMs, track.at ?? 0);
      if (sample.from === sample.to || sample.t <= 0) {
        return { pose: sample.t >= 1 ? sample.to : sample.from, mask: track.mask, weight: scale };
      }
      const definition = blendPoses(
        this.poses,
        this.blended,
        this.blendedBones,
        sample.from,
        sample.to,
        sample.t,
        track.mask,
      );
      return { definition, mask: track.mask, weight: scale };
    }
    return null;
  }
}
