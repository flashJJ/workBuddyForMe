'use client';

import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import type { InteractionKind } from '@wbfm/shared/schemas';
import type { ExpressionTag } from './expression-parser';
import type { TouchControllerLike } from './use-head-touch';
import { MotionMixer, type MotionRotationConfig } from './vrm-motion-mixer';
import { VrmFaceLayer } from './vrm-face-layer';
import { VrmInteractionState, type InteractionPhase } from './vrm-interaction-state';
import { VrmPoseLayer, type NormalizedBoneRef } from './vrm-pose-layer';
import type { MotionPoolEntry } from './motion-segments';

export type { MotionRotationConfig } from './vrm-motion-mixer';

const NORM_BONE_NAMES = [
  'leftShoulder', 'rightShoulder', 'leftUpperArm', 'rightUpperArm',
  'leftLowerArm', 'rightLowerArm', 'head',
] as const;

export interface VrmControllerLike extends TouchControllerLike {
  playSquash(): void;
  flashExpression(tag: ExpressionTag, durationMs: number): void;
  setGaze(nx: number, ny: number): void;
  tap(): void;
  setLipLevel(level: number): void;
  setExpression(tag: ExpressionTag): void;
  dispose(): void;
}

/**
 * VrmController：VRM 渲染运行时门面。
 * 接口对齐 Live2dController（setGaze/tap/setLipLevel/setExpression）
 * + TouchControllerLike（playSquash/flashExpression），
 * 这样 PetStage 的 controllerRef 传递链路不需要任何改动。
 *
 * 职责已按行为轴外迁给三个协作者（本类只保留编排 + 公开 API 转发）：
 * - `MotionMixer`  动作池 / 单 mixer / 待机轮播 / 一次性手势 / primeForFit 采样
 * - `VrmFaceLayer` 常驻表情 + 临时表情 + 口型 + 眨眼
 * - `VrmPoseLayer` squash 形变 + 头部叠加（gaze/点击/wiggle/交互微倾）+ 呼吸与身体微摆
 * - `VrmInteractionState` 三段式阶段机（只产出阶段与微倾角度）
 *
 * animate loop 固定顺序（update 方法内，不可动）：
 *   Step 0  interaction.tick()        ← 三段式阶段推进
 *   Step 1  mixer.update(dt)          ← 动作池 clip 驱动 normalized bone
 *   Step 1.5 mixer.tickRotation(dt)   ← 到点随机换一个待机动作
 *   Step 2  pose.applySquash()        ← vrm.scene.scale sin 包络（210ms）
 *   Step 3  face.checkFlashExpiry()   ← flashUntil 到期恢复 baseExpression
 *   Step 4  pose.applyHeadOverlay()   ← 程序化 wiggle（无 clip）或 gaze/click（有 clip）
 *           pose.applyInteractionAngles() ← 叠三段式微倾
 *   Step 5  pose.applyBodyIdle()      ← 呼吸 position.y + 身体微摆 rotation.y
 *   Step 6  vrm.update(dt)            ← normalized → raw → 场景 + SpringBone 物理
 *   Step 7  face.applyExpressionLayer() ← morph (happy/sad/angry/relaxed/surprised)
 *   Step 8  face.applyLipSync()       ← morph aa = level*3.2
 *   Step 9  face.applyBlink(dt)       ← 每 2-6s 随机眨眼 0.35s sin 包络
 *   Step 10 renderer.render(scene, camera)
 */
export class VrmController implements VrmControllerLike {
  private readonly vrm: VRM;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly clock: THREE.Clock;
  private readonly mixer: MotionMixer;
  private readonly face: VrmFaceLayer;
  private readonly pose: VrmPoseLayer;
  private readonly interaction = new VrmInteractionState();
  /** 上一帧交互阶段（用于检测阶段跃迁，驱动长按三段式） */
  private lastPhase: InteractionPhase = 'idle';

  private disposed = false;

  // ======= 构造 =======

  constructor(
    vrm: VRM,
    gltfAnimations: THREE.AnimationClip[] | undefined,
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    /** 动作池（内置 + 已导入 VRMA）；空数组/undefined 时退回模型内嵌 clip 或程序化姿态 */
    motionPool?: MotionPoolEntry[] | null,
    rotationConfig?: MotionRotationConfig | null,
  ) {
    this.vrm = vrm;
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.clock = new THREE.Clock();

    // 初始化 normalized bone（只读，供 gaze/wiggle 叠加用）
    vrm.update(0.016);
    const normBones = new Map<string, NormalizedBoneRef>();
    for (const name of NORM_BONE_NAMES) {
      const node = vrm.humanoid?.getNormalizedBoneNode(name);
      if (node) normBones.set(name, { name, node, baseQuat: node.quaternion.clone() });
    }

    this.pose = new VrmPoseLayer(vrm, normBones);
    this.face = new VrmFaceLayer(vrm);
    this.mixer = new MotionMixer(vrm, gltfAnimations, motionPool, rotationConfig);
  }

  // ======= VrmControllerLike 公开方法 =======

  /** 注入待机动作轮播配置（开关 + 间隔秒数） */
  setRotationConfig(config: MotionRotationConfig): void {
    this.mixer.setRotationConfig(config);
  }

  /** 从动作池随机换一个 ≠ 当前的待机动作 */
  rotateIdleMotion(): boolean {
    return this.mixer.rotateIdleMotion();
  }

  /** fitVrmToCamera 后重新捕获基础变换（squash / 呼吸叠加的基准） */
  captureBaseScale(): void {
    this.pose.captureBase();
  }

  /** fitVrmToCamera 之前调：采样整个动作池的包围盒并集给取景用 */
  primeForFit(): { min: THREE.Vector3; max: THREE.Vector3 } | null {
    return this.mixer.primeForFit();
  }

  startInteraction(kind: InteractionKind): void {
    if (this.disposed) return;
    this.interaction.start(kind);
  }

  endInteraction(_kind?: InteractionKind): void {
    if (this.disposed) return;
    // 关键：三段式收尾时**强制取消临时表情**，让角色回 idle。
    // 否则 Resolver ActionChain 里 flashExpression(tag, 2600ms) 会独立挂着不走。
    if (this.interaction.end()) this.face.clearFlash();
  }

  playSquash(): void {
    if (this.disposed) return;
    this.pose.playSquash();
  }

  flashExpression(tag: ExpressionTag, durationMs: number): void {
    if (this.disposed) return;
    this.face.flashExpression(tag, durationMs);
  }

  setGaze(nx: number, ny: number): void {
    if (this.disposed) return;
    this.pose.setGaze(nx, ny);
  }

  /** 点击触发：优先从动作池随机播一个一次性动作；池空则退回内嵌 tap clip / 程序化微倾 */
  tap(): void {
    if (this.disposed) return;
    if (this.mixer.playRandomGesture()) return;
    this.pose.nudgeHead();
    this.face.triggerBlink();
  }

  setLipLevel(level: number): void {
    if (this.disposed) return;
    this.face.setLipLevel(level);
  }

  setExpression(tag: ExpressionTag): void {
    if (this.disposed) return;
    this.face.setExpression(tag);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mixer.dispose();
    // 注意：renderer 和 scene 的 dispose 由 vrm-canvas.tsx 的 disposeVrm 统一处理
  }

  // ======= 核心 update（固定 10 步） =======

  update(speaking: boolean, getLevel: () => number): void {
    if (this.disposed) return;
    const dt = this.clock.getDelta();
    const t = this.clock.elapsedTime;

    // --- Step 0: InteractionState phase 推进 ---
    this.interaction.tick();

    // --- Step 0.5: 阶段跃迁 → 长按三段式（loop 进 B 段维持，end 播 C 段回待机）---
    const phase = this.interaction.currentPhase;
    if (phase !== this.lastPhase) {
      if (phase === 'loop') this.mixer.beginHoldMotion();
      else if (phase === 'end') this.mixer.endHoldMotion();
      this.lastPhase = phase;
    }

    // --- Step 1: mixer 驱动动作池 clip ---
    this.mixer.update(dt);

    // --- Step 1.5: 待机动作轮播计时 ---
    this.mixer.tickRotation(dt);

    // --- Step 2: squash 包络 ---
    this.pose.applySquash();

    // --- Step 3: flash 到期检查 ---
    this.face.checkFlashExpiry();

    // --- Step 4: 头部叠加层（程序化 wiggle 或 gaze/click）+ 三段式微倾 ---
    const procedural = this.mixer.usesProceduralPose;
    this.pose.applyHeadOverlay(t, procedural);
    const angles = this.interaction.overlayAngles();
    this.pose.applyInteractionAngles(angles.yaw, angles.pitch);

    // --- Step 5: 呼吸 + 身体微摆（交互 loop 阶段加深呼吸） ---
    this.pose.applyBodyIdle(t, dt, this.interaction.isLooping, procedural);

    // --- Step 6: vrm.update → normalized → raw → 场景 + SpringBone ---
    // normalized bone 在 Step 4 已写好（有 clip 时 mixer 写，无 clip 时程序化写 head）
    // vrm.update 负责把 normalized 同步到 raw，再应用到 scene mesh，并驱动 SpringBone 物理模拟
    this.vrm.update(dt);

    // --- Step 7: morph 表情层 ---
    this.face.applyExpressionLayer();

    // --- Step 8: 口型 aa ---
    this.face.applyLipSync(speaking, getLevel);

    // --- Step 9: 程序化眨眼 ---
    this.face.applyBlink(dt);

    // --- Step 10: render ---
    this.renderer.render(this.scene, this.camera);
  }
}
