/**
 * M0c T1.5/T1.6：VRM 适配层。
 *
 * animation/ 目录里唯一允许 import three 的位置：把 normalized bone 包成 Skeleton 句柄，
 * 把行为轨道展开成 Composer 可消费的姿势轨道，并采样 root 轨道（场景位移/摆动）。
 */

import * as THREE from 'three';
import type { ScriptLookTarget } from '@wbfm/shared/schemas';
import type {
  BoneMask,
  BoneQuat,
  BoneRotation,
  PoseDefinition,
  RootOffset,
} from '../contracts';
import { BehaviorLibrary, BehaviorRunner, type RunnerSnapshot } from '../behavior';
import { Composer, type ComposeTrack } from '../composer';
import { MotionLibrary, emptySample, sampleMotion, type MotionSample } from '../motion';
import { MorphExecutor, MorphMixer, type MorphDebugSnapshot } from '../morph';
import { BehaviorObserver } from '../observability';
import { applyPose, blendPoses, PoseLibrary } from '../pose';
import { Skeleton, type SkeletonBone } from '../skeleton';
import { BEHAVIORS } from '../behaviors';
import { MOTIONS } from '../motions';
import { POSES } from '../poses';
import { POSE_EXECUTORS, resolveTransitionExecutor, type PoseExecutor } from './vrm-executors';
import { collectTrackBones, resolveTrack } from './vrm-compose';
import { BoneCrossFade } from './vrm-crossfade';
import { ROOT_MOTIONS } from './vrm-root';
import { applyMotionArmIntent } from '../arms/motion-intent';
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
/** 手部组件只写手指，挂在左右臂组下 */
const HAND_MASK: BoneMask = { include: ['leftArm', 'rightArm'] };
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
  /** 行为切换：上一姿势 → 新姿势的手臂交叉淡化 */
  private readonly crossFade = new BoneCrossFade();
  private lastBehaviorId: string | null = null;
  /** T2.2/T2.3：语义表情通道（预览 + 行为轨道） */
  private readonly morphMixer = new MorphMixer();
  /** T2.4：当前行为视线（权重 0 = 无） */
  private lookTargetValue: ScriptLookTarget = 'camera';
  private lookLevel = 0;
  /** 额外转身角：世界方向意图随身体朝向旋转（背对时左右手不镜像到中线） */
  private frameYaw = 0;
  constructor(normBones: Map<string, NormalizedBoneRef>) {
    this.normBones = normBones;
    this.skeleton = createVrmSkeleton(normBones);
    this.poses = new PoseLibrary(POSES);
    this.motions = new MotionLibrary(MOTIONS);
    this.behaviors = new BehaviorLibrary(BEHAVIORS);
    this.runner = new BehaviorRunner(this.behaviors);
    this.composer = new Composer(this.skeleton, this.poses, (id, weight, progress, timeMs) => {
      const executor = POSE_EXECUTORS[id];
      if (!executor) return false;
      executor(this.skeleton, this.normBones, weight * progress, timeMs / 1000, this.frameYaw);
      return true;
    });
  }
  captureBase(): void {
    this.skeleton.capture();
  }
  /** 每帧由姿态层写入：世界方向意图按此转身角旋转 */
  setFrameYaw(yaw: number): void { this.frameYaw = yaw; }
  captureFrame(): void {
    if (this.composedBones.length > 0) this.skeleton.reset(this.composedBones);
    this.skeleton.captureFrame();
  }

  /** 每帧在 mixer 写骨骼前调用：缓存上一帧最终姿势，作为交叉淡化起点 */
  rememberFrame(): void { this.crossFade.remember(this.skeleton); }
  get active(): boolean { return this.runner.active; }
  get snapshot(): Readonly<RunnerSnapshot> { return this.runner.snapshot; }

  /** T1.8：当前行为 id/阶段/轨道权重与最近过渡 */
  get debug() {
    return this.observer.snapshot(this.runner);
  }

  /** T2.2：挂接语义表情执行器（VRM 适配层构造，运行时不依赖 three 类型） */
  attachMorph(executor: MorphExecutor): void {
    this.morphMixer.attach(executor);
  }

  /** 设置 dev 预览通道（0..1）；null/空 = 释放。行为表情优先于预览 */
  setMorphChannels(channels: Readonly<Record<string, number>> | null): void {
    this.morphMixer.setPreview(channels);
  }

  /** 在 vrm.update 之后、render 之前调用；返回本帧写入的 target 次数 */
  applyMorph(): number {
    return this.morphMixer.apply();
  }

  /** T2.2：表情通道调试快照（dev 面板） */
  get morph(): MorphDebugSnapshot | null {
    return this.morphMixer.debug;
  }

  /** T2.4：行为视线目标；无活动轨道时为 null */
  get activeLookTarget(): ScriptLookTarget | null {
    return this.lookLevel > 0 ? this.lookTargetValue : null;
  }

  /** T2.4：行为权重 × 轨道权重（0..1） */
  get activeLookWeight(): number {
    return this.lookLevel;
  }

  play(id: string, force = false): boolean {
    const started = force ? this.runner.playNow(id) : this.runner.play(id);
    if (started) this.markBehavior();
    return started;
  }

  stop(clearQueue = false): boolean {
    if (clearQueue) this.runner.clearQueue();
    const stopped = this.runner.stop(); this.markBehavior(); return stopped;
  }

  /** 行为 id 变化时捕获上一姿势作为交叉淡化起点 */
  private markBehavior(): void {
    const id = this.runner.snapshot.id;
    if (id === this.lastBehaviorId) return;
    this.lastBehaviorId = id;
    if (id) {
      // 抓取/落地需要即时反馈，交叉淡化也按 4 倍速收短
      const fast = id === 'behavior.lifted' || id === 'behavior.land';
      this.crossFade.begin(this.skeleton, fast ? 45 : 180);
    } else this.crossFade.reset();
  }

  /** 推进行为时钟并合成；dtMs = 0 冻结。返回写入骨骼数 */
  update(dtMs: number): number {
    this.runner.update(dtMs);
    this.observer.sample(this.runner);
    this.markBehavior();
    if (this.runner.active) {
      this.crossFade.advance(dtMs, this.runner.weight);
      return this.compose();
    }
    this.crossFade.reset();
    if (!this.composed) return 0;
    this.composed = false;
    this.skeleton.restoreFrame();
    this.skeleton.reset(this.composedBones);
    this.composedBones.length = 0;
    this.root.y = 0;
    this.root.yaw = 0;
    this.root.roll = 0;
    this.morphMixer.clearBehavior();
    this.lookLevel = 0;
    return 0;
  }

  /** 按当前阶段轨道合成；无行为时清空轨道并写回帧快照 */
  compose(): number {
    this.tracks.length = 0;
    this.root.y = 0;
    this.root.yaw = 0;
    this.root.roll = 0;
    this.morphMixer.clearBehavior();
    this.lookLevel = 0;
    this.composed = this.runner.active;
    if (this.runner.active) {
      const weight = this.runner.weight;
      const elapsed = this.runner.phaseElapsedMs;
      const totalElapsed = this.runner.snapshot.elapsedMs;
      for (const track of this.runner.tracks) {
        if (track.kind === 'root') {
          ROOT_MOTIONS[track.motion]?.(this.root, elapsed);
          continue;
        }
        if (track.kind === 'morph') {
          this.morphMixer.collect(track, weight);
          continue;
        }
        if (track.kind === 'look') { this.collectLook(track, weight); continue; }
        const composed = resolveTrack(track, weight, elapsed, {
          poses: this.poses,
          motions: this.motions,
          sample: this.sample,
          blended: this.blended,
          blendedBones: this.blendedBones,
        }, totalElapsed);
        if (composed) {
          this.tracks.push(composed);
          collectTrackBones(composed, this.skeleton, this.poses, this.composedBones);
        }
      }
      this.root.y *= weight;
      this.root.yaw *= weight;
      this.root.roll *= weight;
    }
    this.crossFade.apply(this.skeleton);
    return this.composer.compose(this.tracks);
  }

  /** T2.4：视线轨道 → 目标；多轨道取权重最大者，不叠加角度 */
  private collectLook(track: { target: ScriptLookTarget; weight?: number }, weight: number): void {
    const scaled = weight * (track.weight ?? 1);
    if (!(scaled > this.lookLevel)) return;
    this.lookLevel = scaled > 1 ? 1 : scaled;
    this.lookTargetValue = track.target;
  }

  /** 单姿势执行器（垂臂/悬空四肢）；没有执行器时走通用 applyPose */
  applyPose(id: string, weight: number, t = 0, additive = true, frameYaw = this.frameYaw): number {
    const executor: PoseExecutor | undefined = POSE_EXECUTORS[id];
    if (executor) {
      executor(this.skeleton, this.normBones, weight, t, frameYaw);
      return 1;
    }
    const pose = this.poses.get(id);
    return pose ? applyPose(this.skeleton, pose, { weight, additive }) : 0;
  }

  hasMotion(id: string): boolean {
    return this.motions.has(id);
  }

  /**
   * 直接采样并应用一个 L2 动作（不经过行为状态机）。
   * 用于待机手部/重心/触摸反应；additive=false 保证每帧从绑定姿态重算，不会累加。
   * mask 默认手部组件掩码，非手部动作（脊柱/腿）必须显式传入自己的掩码。
   */
  applyMotion(id: string, elapsedMs: number, weight = 1, offsetMs = 0, mask: BoneMask = HAND_MASK): number {
    if (weight <= 0) return 0;
    const motion = this.motions.get(id);
    if (!motion) return 0;
    const sample = sampleMotion(this.sample, motion, elapsedMs, offsetMs);
    let pose = sample.from ? this.poses.get(sample.from) : undefined;
    if (sample.from !== sample.to && sample.t > 0) {
      pose = blendPoses(
        this.poses,
        this.blended,
        this.blendedBones,
        sample.from,
        sample.to,
        sample.t,
        mask,
      );
    } else if (sample.t >= 1) {
      pose = this.poses.get(sample.to) ?? pose;
    }
    const transition = resolveTransitionExecutor(sample.from, sample.to, sample.t);
    if (transition) return this.applyPose(transition.id, weight * transition.progress, 0, false);
    const written = pose ? applyPose(this.skeleton, pose, { weight, additive: false }) : 0;
    applyMotionArmIntent(this.normBones, this.frameYaw, sample, weight, mask);
    return written;
  }
}
