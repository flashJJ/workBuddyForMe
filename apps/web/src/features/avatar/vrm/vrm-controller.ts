'use client';

import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import type { InteractionKind, MotionSelectionContext } from '@wbfm/shared/schemas';
import type { ExpressionTag } from '../expression/expression-parser';
import type { TouchControllerLike } from '../ui/use-head-touch';
import { MotionMixer, type MotionRotationConfig } from './vrm-motion-mixer';
import { VrmFaceLayer } from './vrm-face-layer';
import { VrmInteractionState, type InteractionPhase } from './vrm-interaction-state';
import { VrmPoseLayer, type NormalizedBoneRef } from './vrm-pose-layer';
import { prepareVrmModel, VrmTailLayer } from './asset';
import { pickAmbientBehavior, pickTapGesture } from '../performance/gesture';
import type { MotionPoolEntry } from '../motion/motion-segments';
import { NORM_BONE_NAMES } from '../pose/bones';

export type { MotionRotationConfig } from './vrm-motion-mixer';

export interface VrmControllerLike extends TouchControllerLike {
  playSquash(): void;
  flashExpression(tag: ExpressionTag, durationMs: number): void;
  setGaze(nx: number, ny: number): void;
  tap(): void;
  setLipLevel(level: number): void;
  setExpression(tag: ExpressionTag): void;
  playBehavior?(id: string): boolean;
  stopBehavior?(): boolean;
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
 *   Step 1  mixer.update(dt) + tickRotation(dt) ← 动作池 clip 驱动 + 待机轮播
 *   Step 2  pose.applySquash()        ← vrm.scene.scale sin 包络（210ms）
 *   Step 3  face.checkFlashExpiry()   ← flashUntil 到期恢复 baseExpression
 *   Step 4  pose.applyHeadOverlay() + applyInteractionAngles() ← wiggle/gaze/微倾
 *   Step 5  pose.applyBodyIdle()      ← 呼吸 position.y + 身体微摆 rotation.y
 *   Step 6  vrm.update(dt)            ← normalized → raw → 场景 + SpringBone 物理
 *   Step 7  face.applyExpressionLayer() ← morph (happy/sad/angry/relaxed/surprised)
 *   Step 8  face.applyLipSync() + applyBlink(dt) ← 口型 + 随机眨眼
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
  private readonly tail: VrmTailLayer;
  private readonly interaction = new VrmInteractionState();
  private lastPhase: InteractionPhase = 'idle';
  private nextAmbientAt = 0;
  private sleeping = false;
  private faceAway = false;
  private disposed = false;

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

    // 资产兜底：布料双面 + 重复弹簧冻结（必须在首次 update 之前）
    prepareVrmModel(vrm);

    // 初始化 normalized bone（只读，供 gaze/wiggle 叠加用）
    vrm.update(0.016);
    const normBones = new Map<string, NormalizedBoneRef>();
    for (const name of NORM_BONE_NAMES) {
      const node = vrm.humanoid?.getNormalizedBoneNode(name);
      if (node) normBones.set(name, { name, node, baseQuat: node.quaternion.clone() });
    }

    this.pose = new VrmPoseLayer(vrm, normBones);
    this.face = new VrmFaceLayer(vrm);
    this.tail = new VrmTailLayer(vrm);
    this.mixer = new MotionMixer(vrm, gltfAnimations, motionPool, rotationConfig);
  }

  // ======= VrmControllerLike 公开方法 =======

  /** 注入待机动作轮播配置（开关 + 间隔秒数） */
  setRotationConfig(config: MotionRotationConfig): void {
    this.mixer.setRotationConfig(config);
  }

  /** v2.2：注入状态驱动挑选输入（情绪档位 + 关系等级）；由 VrmCanvas 每帧同步 */
  setMotionPreference(preference: MotionSelectionContext): void {
    if (this.disposed) return;
    this.mixer.setPreference(preference);
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

  /** v3.0 P1：睡眠/唤醒（闭眼、低头、动作减速、待机轮播暂停） */
  setSleeping(sleeping: boolean): void {
    if (this.disposed) return;
    this.sleeping = sleeping;
    // 唤醒后重新排期，避免把睡眠时长一次性补成「立刻做动作」
    if (!sleeping) this.nextAmbientAt = 0;
    this.pose.setSleeping(sleeping);
    this.face.setSleeping(sleeping);
    this.mixer.setSleeping(sleeping);
  }

  /** v3.5：久无交互背对 / 被交互转回（只影响 VRM；Live2D 无此 API） */
  setFaceAway(away: boolean): void {
    if (this.disposed) return;
    this.faceAway = away;
    this.pose.setFaceAway(away);
  }

  /** 被拎起：向上拖拽时进入悬空姿态，松手回弹 */
  setRaised(raised: boolean): void {
    if (!this.disposed) this.pose.setRaised(raised);
  }

  /** M0c：播放/停止 L3 分层行为（behavior.*），enter/loop/exit 由动效库单时钟推进 */
  playBehavior(id: string): boolean { return !this.disposed && this.pose.playBehavior(id); }
  stopBehavior(): boolean { return !this.disposed && this.pose.stopBehavior(); }

  /** 点击触发：优先从动作池随机播一个一次性动作；池空则退回程序化手势 */
  tap(): void {
    if (this.disposed) return;
    if (this.mixer.playRandomGesture()) return;
    this.pose.playGesture(pickTapGesture());
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

  /** 环境微行为：无动作 clip/手势/交互/睡眠/背对时每 8–20s 随机一次 */
  private tickAmbient(): void {
    if (this.sleeping || this.faceAway || this.mixer.hasGesture || this.interaction.currentPhase !== 'idle') return;
    const now = performance.now();
    if (this.nextAmbientAt === 0) {
      this.nextAmbientAt = now + 6000 + Math.random() * 6000;
      return;
    }
    if (now < this.nextAmbientAt) return;
    this.nextAmbientAt = now + 8000 + Math.random() * 12_000;
    const behavior = pickAmbientBehavior();
    if (behavior === 'blink') this.face.triggerBlink();
    else this.pose.playGesture(behavior);
  }

  update(speaking: boolean, getLevel: () => number): void {
    if (this.disposed) return;
    // v3.0 P0：隐藏档暂停渲染后恢复时，避免一次巨大的 dt 让 SpringBone/动作跳变
    const dt = Math.min(0.05, this.clock.getDelta());
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

    // --- Step 0.7: 叠加骨骼复位（mixer 未驱动的轨道不残留上一帧视线）---
    this.pose.resetOverlayBones();

    // --- Step 1: mixer 驱动动作池 clip ---
    this.mixer.update(dt);
    // 快照 mixer 本帧姿态；视线/脊柱在其上合成，避免逐帧累积
    this.pose.captureMixerPose();

    // --- Step 1.5: 待机动作轮播计时 ---
    this.mixer.tickRotation(dt);

    // --- Step 2: squash 包络 ---
    this.pose.applySquash();

    // --- Step 3: flash 到期检查 ---
    this.face.checkFlashExpiry();

    // --- Step 4: 头部叠加层（视线/点击微倾）+ 三段式微倾 ---
    const procedural = this.mixer.usesProceduralPose;
    // 交互动作期间淡出视线，避免「头被掰过去」
    const gazeWeight = this.mixer.hasGesture || this.interaction.isLooping ? 0.25 : 1;
    this.pose.applyHeadOverlay(t, procedural, dt, gazeWeight);
    const angles = this.interaction.overlayAngles();
    this.pose.applyInteractionAngles(angles.yaw, angles.pitch);
    // v3.0 P1：待机时把 A-pose 手臂收成自然下垂；手势/长按/被拎起期间不干预
    if (!this.mixer.hasGesture && !this.interaction.isLooping && !this.pose.raised) {
      this.pose.relaxArms(procedural ? 1 : 0.7, t);
    }

    // --- Step 5: 呼吸 + 身体微摆（交互 loop 阶段加深呼吸） ---
    this.pose.applyBodyIdle(t, dt, this.interaction.isLooping, procedural);
    // --- Step 5.5: 环境微行为（眨眼/点头/歪头/瞥视），避免待机像摆件 ---
    this.tickAmbient();

    // --- Step 6: vrm.update → normalized → raw → 场景 + SpringBone ---
    // normalized bone 在 Step 4 已写好；vrm.update 同步到 raw、应用到 mesh 并驱动 SpringBone
    this.vrm.update(dt);
    // 非 humanoid 且未配 SpringBone 的尾巴：程序化小幅摆动
    this.tail.update(t);

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
