'use client';

import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import {
  TOUCH_SQUASH_MS,
  TOUCH_SQUASH_SCALE_X,
  TOUCH_SQUASH_SCALE_Y,
} from '@wbfm/shared/constants';
import type { InteractionKind } from '@wbfm/shared/schemas';
import { DEFAULT_EXPRESSION, type ExpressionTag } from './expression-parser';
import type { TouchControllerLike } from './use-head-touch';

/** three-vrm expressionManager preset 名 */
const VRM_EXPRESSION_MAP: Record<ExpressionTag, string> = {
  joy: 'happy',
  sadness: 'sad',
  anger: 'angry',
  neutral: 'relaxed',
  surprise: 'surprised',
  disgust: 'angry',
  fear: 'sad',
  smirk: 'surprised',
};

const NORM_BONE_NAMES = [
  'leftShoulder', 'rightShoulder', 'leftUpperArm', 'rightUpperArm',
  'leftLowerArm', 'rightLowerArm', 'head',
] as const;

/**
 * Relax pose 角度（坐标系：+X 右 +Y 上 +Z 前）。
 * 最终角度经 axis-angle 实测验证（M2 迭代定稿）。
 * premultiply = left multiply = finalQ = offsetQ * baseQ（在 rest pose 基础上叠加旋转）。
 */
interface BoneOffset { axis: [number, number, number]; deg: number }
const RELAX_OFFSETS = {
  // T-pose 手臂水平朝两侧（右臂+X / 左臂-X），下垂需绕对应轴旋转
  // 右手定则：右臂 +X → -Y 下垂 绕 +Z；左臂 -X → -Y 下垂 绕 -Z
  leftShoulder:  { axis: [0, 0, -1], deg: 30 },
  rightShoulder: { axis: [0, 0,  1], deg: 30 },
  leftUpperArm:  { axis: [-1, 0, 0], deg: 15 },
  rightUpperArm: { axis: [ 1, 0, 0], deg: 15 },
  leftLowerArm:  { axis: [-1, 0, 0], deg: 50 },
  rightLowerArm: { axis: [ 1, 0, 0], deg: 50 },
  head:          { axis: [-1, 0, 0], deg: 5 },
} as const satisfies Record<string, BoneOffset>;

function offsetQuat(o: BoneOffset): THREE.Quaternion {
  return new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(o.axis[0], o.axis[1], o.axis[2]),
    (o.deg * Math.PI) / 180,
  );
}

interface NormalizedBoneRef {
  name: string;
  node: THREE.Object3D;
  baseQuat: THREE.Quaternion;
}

/** Tap clip 单次播放的轨道名匹配模式 */
const TAP_CLIP_PATTERNS = /tap|click|hit|touch|poke/i;
const IDLE_CLIP_PATTERNS = /idle|loop|standby|待?机/i;

interface SelectClipResult {
  idleClip: THREE.AnimationClip | null;
  tapClip: THREE.AnimationClip | null;
}

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
 * VrmController：把 vrm-canvas 里的运行时骨骼/动作/表情逻辑抽成独立类。
 * 接口对齐 Live2dController（setGaze/tap/setLipLevel/setExpression）
 * + TouchControllerLike（playSquash/flashExpression），
 * 这样 PetStage 的 controllerRef 传递链路不需要任何改动。
 *
 * animate loop 固定顺序（update 方法内，不可动）：
 *   Step 1  mixer.update(dt)                    ← 内嵌 gltf.animations clip 驱动 normalized bone
 *   Step 2  applySquash()                       ← vrm.scene.scale sin 包络（210ms）
 *   Step 3  checkFlashExpiry()                  ← flashUntil 到期恢复 baseExpression
 *   Step 4  程序化叠加层
 *           有 idle clip: applyGazeOverlay()     ← 只叠 gaze + clickFeedback（不破坏 mixer 轨道）
 *           无 idle clip: applyProgrammaticPose() ← baseQ → relaxQ → wiggleQ → gazeQ → clickQ
 *   Step 5  applyBodyIdle(t, dt)                ← 呼吸 position.y + 身体微摆 rotation.y
 *   Step 6  vrm.update(dt)                      ← normalized → raw → 场景 + SpringBone 物理
 *   Step 7  applyExpressionLayer()              ← morph target (happy/sad/angry/relaxed/surprised)
 *   Step 8  applyLipSync(speaking, level)       ← morph target aa = level*3.2
 *   Step 9  applyBlink(t)                       ← 每 2-6s 随机眨眼 0.35s sin 包络
 *   Step 10 renderer.render(scene, camera)
 */
export class VrmController implements VrmControllerLike {
  private readonly vrm: VRM;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly clock: THREE.Clock;
  private readonly normBones: Map<string, NormalizedBoneRef>;
  private readonly rawBones: Map<string, THREE.Bone>;
  private readonly rawBaseQuats = new Map<string, THREE.Quaternion>();

  // === mixer ===
  private idleMixer: THREE.AnimationMixer | null = null;
  private tapMixer: THREE.AnimationMixer | null = null;
  private idleClip: THREE.AnimationClip | null = null;
  private tapClip: THREE.AnimationClip | null = null;
  private proceduralWiggle = true;

  // === squash ===
  private squashStart = 0;
  /** fitVrmToCamera 设置的基础 scale，squash 在其之上叠加 */
  private readonly baseSceneScale: THREE.Vector3;

  // === flash expression ===
  private baseExpression: ExpressionTag = DEFAULT_EXPRESSION;
  private flashTag: ExpressionTag | null = null;
  private flashUntil = 0;

  // === gaze / click feedback ===
  private gazeYaw = 0;
  private gazePitch = 0;
  private headYawOffset = 0; // 点击头部微倾

  // === body idle ===
  private breathePhase = 0;

  // === blink ===
  private blinkProgress = 0;    // 当前眨眼进度 0..1，0=未在播
  private blinkDuration = 0.35; // 秒
  private blinkNextDelay = 0;   // 距下次眨眼剩余秒

  // === lip ===
  private lipLevel = 0;

  // === 三段式 InteractionState ===
  /** 当前交互阶段 */
  private interactionPhase: 'idle' | 'start' | 'loop' | 'end' = 'idle';
  /** 交互类型（head-touch / body-touch 等） */
  private interactionKind: InteractionKind | null = null;
  /** 进入 start 阶段的时间戳 */
  private interactionStartAt = 0;
  /** end 阶段完成时间戳（到时后回到 idle） */
  private interactionEndAt = 0;
  /** start 阶段时长（ms）—— VPpet A_Start */
  private static readonly START_DURATION_MS = 200;
  /** end 阶段时长（ms）—— VPpet C_End */
  private static readonly END_DURATION_MS = 300;

  private disposed = false;

  // ======= 构造 =======

  constructor(
    vrm: VRM,
    gltfAnimations: THREE.AnimationClip[] | undefined,
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
  ) {
    this.vrm = vrm;
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.clock = new THREE.Clock();
    // 捕获 fitVrmToCamera 之后的基础 scale，squash 在其之上叠加
    this.baseSceneScale = vrm.scene.scale.clone();

    // 初始化 normalized bone（只读，供 gaze/wiggle 叠加用）+ raw bone（直接改它生效）
    vrm.update(0.016);
    this.normBones = new Map();
    this.rawBones = new Map();
    for (const name of NORM_BONE_NAMES) {
      const node = vrm.humanoid?.getNormalizedBoneNode(name);
      if (node) {
        this.normBones.set(name, { name, node, baseQuat: node.quaternion.clone() });
      }
      const rawBone = vrm.humanoid?.getRawBoneNode(name) as THREE.Bone | undefined;
      if (rawBone) this.rawBones.set(name, rawBone);
    }
    console.log('[VRM] bones ready: norm=' + [...this.normBones.keys()].length + ', raw=' + [...this.rawBones.keys()].length);

    // Relax pose 应用一次（Step 6.5 applyRelaxPoseDirect 每帧重新应用，这里是为了 fitVrmToCamera 之前让初始姿态也对）
    this.applyRelaxPose();

    // 动作来源：优先内嵌 clip，无则程序化
    const { idleClip, tapClip } = this.selectClips(gltfAnimations ?? []);
    this.idleClip = idleClip;
    this.tapClip = tapClip;
    if (idleClip) {
      const root = vrm.humanoid?.normalizedHumanBonesRoot ?? vrm.scene;
      this.idleMixer = new THREE.AnimationMixer(root);
      this.idleMixer.clipAction(idleClip).play();
      this.proceduralWiggle = false;
      console.log('[VrmController] idle clip:', idleClip.name);
    } else {
      this.proceduralWiggle = true;
      console.log('[VrmController] no idle clip, using procedural wiggle');
    }
    if (tapClip) {
      const root = vrm.humanoid?.normalizedHumanBonesRoot ?? vrm.scene;
      this.tapMixer = new THREE.AnimationMixer(root);
      console.log('[VrmController] tap clip:', tapClip.name);
    }
  }

  private selectClips(clips: THREE.AnimationClip[]): SelectClipResult {
    if (clips.length === 0) return { idleClip: null, tapClip: null };
    const idleClip =
      clips.find((c) => IDLE_CLIP_PATTERNS.test(c.name)) ??
      [...clips].sort((a, b) => b.duration - a.duration)[0] ?? null;
    const tapClip = clips.find((c) => TAP_CLIP_PATTERNS.test(c.name)) ?? null;
    return { idleClip, tapClip };
  }

  private applyRelaxPose(): void {
    for (const [name, offset] of Object.entries(RELAX_OFFSETS)) {
      const ref = this.normBones.get(name);
      if (!ref) continue;
      const offsetQ = offsetQuat(offset);
      ref.node.quaternion.copy(ref.baseQuat).premultiply(offsetQ);
    }
  }

  // ======= VrmControllerLike 公开方法 =======

  /** fitVrmToCamera 后重新捕获基础 scale（squash 叠加用） */
  captureBaseScale(): void {
    this.baseSceneScale.copy(this.vrm.scene.scale);
  }

  // ======= 三段式 InteractionState（Vpet A_Start → B_Loop → C_End） =======

  /**
   * 开始交互（tap / 长按触发）。
   * 防重入：start 阶段不打断；loop 阶段延长（SetContinue 语义）。
   */
  startInteraction(kind: InteractionKind): void {
    if (this.disposed) return;
    const now = performance.now();

    switch (this.interactionPhase) {
      case 'start':
        // 入场动画播放中——VPpet 直接 return，不打断
        return;

      case 'loop':
        // 正在持续按住——延长 loop，不重开
        // （不重新进入 start，保持在 loop 里）
        this.interactionStartAt = now;
        return;

      case 'end':
        // 收尾动画还没做完——丢弃，等收尾完了再说
        return;

      case 'idle':
      default:
        this.interactionPhase = 'start';
        this.interactionKind = kind;
        this.interactionStartAt = now;
        break;
    }
  }

  /** 结束交互（松手触发）——从 start 或 loop 进入 end，结束后回 idle */
  endInteraction(_kind?: InteractionKind): void {
    if (this.disposed) return;
    if (this.interactionPhase === 'start' || this.interactionPhase === 'loop') {
      this.interactionPhase = 'end';
      this.interactionEndAt = performance.now() + VrmController.END_DURATION_MS;
    }
    // idle / end 状态下 endInteraction 是 no-op
  }

  playSquash(): void {
    if (this.disposed) return;
    this.squashStart = performance.now();
  }

  flashExpression(tag: ExpressionTag, durationMs: number): void {
    if (this.disposed) return;
    this.flashTag = tag;
    this.flashUntil = performance.now() + durationMs;
    this.applyExpressionNow(tag);
  }

  setGaze(nx: number, ny: number): void {
    if (this.disposed) return;
    // nx/ny 归一化 -1..1 → 角度制 yaw/pitch（弧度）
    this.gazeYaw = nx * 0.2;
    this.gazePitch = -ny * 0.15;
  }

  tap(): void {
    if (this.disposed) return;
    if (this.tapClip && this.tapMixer) {
      const action = this.tapMixer.clipAction(this.tapClip);
      action.reset().play();
    } else {
      // 程序化 fallback：头部微倾 + 眨眼
      this.headYawOffset = (Math.random() - 0.5) * 0.15;
      this.triggerBlink();
    }
  }

  setLipLevel(level: number): void {
    if (this.disposed) return;
    this.lipLevel = level;
  }

  setExpression(tag: ExpressionTag): void {
    if (this.disposed) return;
    this.baseExpression = tag;
    if (!this.flashTag) this.applyExpressionNow(tag);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.idleMixer?.stopAllAction();
    this.tapMixer?.stopAllAction();
    // 注意：renderer 和 scene 的 dispose 由 vrm-canvas.tsx 的 disposeVrm 统一处理
  }

  // ======= 核心 update（固定 10 步） =======

  update(speaking: boolean, getLevel: () => number): void {
    if (this.disposed) return;
    const dt = this.clock.getDelta();
    const t = this.clock.elapsedTime;

    // --- Step 0: InteractionState phase 推进 ---
    this.tickInteractionPhase();

    // --- Step 1: mixer 驱动内嵌 clip ---
    this.idleMixer?.update(dt);
    this.tapMixer?.update(dt);

    // --- Step 2: squash 包络 + InteractionState 叠加形变 ---
    this.applySquash();

    // --- Step 3: flash 到期检查 ---
    this.checkFlashExpiry();

    // --- Step 4: 程序化叠加层（base → relax → wiggle → gaze → click → interaction 叠加） ---
    if (this.proceduralWiggle) {
      this.applyProgrammaticPose(t);
    } else {
      this.applyGazeOverlay();
    }
    this.applyInteractionOverlay(t);

    // --- Step 5: 呼吸 + 身体微摆（交互状态下加深呼吸） ---
    this.applyBodyIdle(t, dt);

    // --- Step 6: vrm.update → normalized → raw → 场景 + SpringBone ---
    this.vrm.update(dt);

    // *** FINAL FIX：normalized bone 在 vrm.update 之后不会被重置，
    // 但我们改 normalized bone 可能没正确同步到 scene mesh。
    // 直接在 vrm.update 之后改 raw bone 的 quaternion（跳过 humanoid 管道）！
    // --- Step 6.5: 在 vrm.update 之后直接改 raw bone（确保生效） ---
    this.applyRelaxPoseDirect();

    // --- Step 7: morph 表情层 ---
    this.applyExpressionLayer();

    // --- Step 8: 口型 aa ---
    this.applyLipSync(speaking, getLevel);

    // --- Step 9: 程序化眨眼 ---
    this.applyBlink(t, dt);

    // --- Step 10: render ---
    this.renderer.render(this.scene, this.camera);
  }

  // ======= update 内 10 步的私有实现 =======

  private applySquash(): void {
    if (this.squashStart === 0) return;
    const t = (performance.now() - this.squashStart) / TOUCH_SQUASH_MS;
    if (t >= 1) {
      this.squashStart = 0;
      this.vrm.scene.scale.copy(this.baseSceneScale);
      return;
    }
    const envelope = Math.sin(t * Math.PI);
    // 在 fitVrmToCamera 设置的基础 scale 上叠加 squash 形变
    const sx = 1 + (TOUCH_SQUASH_SCALE_X - 1) * envelope;
    const sy = 1 - (1 - TOUCH_SQUASH_SCALE_Y) * envelope;
    this.vrm.scene.scale.set(
      this.baseSceneScale.x * sx,
      this.baseSceneScale.y * sy,
      this.baseSceneScale.z,
    );
  }

  private checkFlashExpiry(): void {
    if (!this.flashTag) return;
    if (performance.now() > this.flashUntil) {
      this.flashTag = null;
      this.applyExpressionNow(this.baseExpression);
    }
  }

  /**
   * 无 idle clip 时：每帧重建所有骨骼 = baseQ → relaxQ
   *                  head 额外叠加 → wiggleQ → gazeQ → clickQ
   * 关键：vrm.update 内部 humanoid.update 会重置 normalized bone，
   *       所以必须每帧都写回 relax pose（不能只在 constructor 里做一次）。
   */
  private applyProgrammaticPose(t: number): void {
    // 先对所有骨骼应用 relax pose（每帧都要写回，因为 humanoid.update 会重置）
    for (const [name, offset] of Object.entries(RELAX_OFFSETS)) {
      const ref = this.normBones.get(name);
      if (!ref) continue;
      const offsetQ = offsetQuat(offset);
      ref.node.quaternion.copy(ref.baseQuat).premultiply(offsetQ);
    }
    // head 额外叠加程序化 wiggle + gaze + clickFeedback
    const headRef = this.normBones.get('head');
    if (headRef) {
      const wiggleYaw = Math.sin(t * 0.5) * 0.06;
      const wigglePitch = Math.sin(t * 0.7) * 0.04;
      const yawQ = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        wiggleYaw + this.gazeYaw + this.headYawOffset,
      );
      const pitchQ = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        wigglePitch + this.gazePitch,
      );
      // relax pose 已经在上面对 head 应用了，现在叠加 wiggle + gaze
      headRef.node.quaternion.premultiply(pitchQ).premultiply(yawQ);
    }
    this.headYawOffset *= 0.85;
    if (Math.abs(this.headYawOffset) < 0.003) this.headYawOffset = 0;
  }

  /** 有 idle clip 时：只叠 gaze + clickFeedback（不破坏 mixer 轨道） */
  private applyGazeOverlay(): void {
    const headRef = this.normBones.get('head');
    if (!headRef) return;
    // premultiply 在当前 mixer 已设的 quaternion 上叠加
    if (this.gazeYaw !== 0 || this.gazePitch !== 0 || this.headYawOffset !== 0) {
      const yawQ = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        this.gazeYaw + this.headYawOffset,
      );
      const pitchQ = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        this.gazePitch,
      );
      headRef.node.quaternion.premultiply(pitchQ).premultiply(yawQ);
    }
    this.headYawOffset *= 0.85;
    if (Math.abs(this.headYawOffset) < 0.003) this.headYawOffset = 0;
  }

  private applyBodyIdle(t: number, dt: number): void {
    this.breathePhase += dt;
    // 呼吸浮动——交互状态下加深（VPpet B_Loop 身体反应）
    const breatheAmp = this.interactionPhase === 'loop' ? 0.022 : 0.012;
    this.vrm.scene.position.y = Math.sin(this.breathePhase * 1.2) * breatheAmp;
    // 身体微晃（只在无 clip 时）
    if (this.proceduralWiggle) {
      this.vrm.scene.rotation.y = Math.sin(t * 0.25) * 0.015;
    }
  }

  /** InteractionState phase 推进：start → (loop 由外部 continue 维持) → end → idle */
  private tickInteractionPhase(): void {
    const now = performance.now();
    switch (this.interactionPhase) {
      case 'start':
        if (now - this.interactionStartAt >= VrmController.START_DURATION_MS) {
          this.interactionPhase = 'loop';
        }
        break;
      case 'end':
        if (now >= this.interactionEndAt) {
          this.interactionPhase = 'idle';
          this.interactionKind = null;
        }
        break;
      case 'loop':
      case 'idle':
      default:
        // loop 保持（等外部 endInteraction），idle 保持
        break;
    }
  }

  /**
   * InteractionState 叠加层：根据 phase 在程序化层叠加上头部微倾。
   * 有 clip 时也叠加（因为只改 normalized bone 的头部旋转，不破坏 mixer 轨道）。
   */
  private applyInteractionOverlay(_t: number): void {
    if (this.interactionPhase === 'idle') return;

    const headRef = this.normBones.get('head');
    if (!headRef) return;

    // 按 phase 算叠加角度
    let extraYaw = 0;
    let extraPitch = 0;

    if (this.interactionPhase === 'start') {
      // start 入场：头部微下倾 + squash 形变（和 playSquash 叠加但独立）
      const elapsed = (performance.now() - this.interactionStartAt) / VrmController.START_DURATION_MS;
      const envelope = Math.sin(elapsed * Math.PI); // 0 → 1 → 0
      extraYaw = 0.08 * envelope;
      extraPitch = 0.04 * envelope;
    } else if (this.interactionPhase === 'loop') {
      // loop 持续：头部微倾保持 + 呼吸已在 applyBodyIdle 加深
      extraYaw = 0.06;
      extraPitch = 0.03;
    } else if (this.interactionPhase === 'end') {
      // end 收尾：回正，衰减
      const remaining = Math.max(0, (this.interactionEndAt - performance.now()) / VrmController.END_DURATION_MS);
      extraYaw = 0.06 * remaining;
      extraPitch = 0.03 * remaining;
    }

    if (extraYaw !== 0 || extraPitch !== 0) {
      const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), extraYaw);
      const pitchQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), extraPitch);
      headRef.node.quaternion.premultiply(pitchQ).premultiply(yawQ);
    }
  }

  /**
   * 在 vrm.update(dt) 之后直接改 raw bone quaternion。
   * 跳过 normalized humanoid 管道——normalized bone 改了值但没正确同步到 scene mesh
   * （humanoid.update 内部的 normalizedHumanBones.update 行为不确定）。
   * raw bone 直接对应 scene 里的实际 mesh，改它肯定生效。
   */
  private applyRelaxPoseDirect(): void {
    if (!this.proceduralWiggle) return; // 有 idle clip 时 mixer 驱动，不动 raw bone
    for (const [name, offset] of Object.entries(RELAX_OFFSETS)) {
      const raw = this.rawBones.get(name);
      if (!raw) continue;
      // 先 clone 当前 raw bone 的 base rotation（第一次设时存下）
      if (!this.rawBaseQuats.has(name)) {
        this.rawBaseQuats.set(name, raw.quaternion.clone());
      }
      const baseQ = this.rawBaseQuats.get(name)!;
      const offsetQ = offsetQuat(offset);
      raw.quaternion.copy(baseQ).premultiply(offsetQ);
    }
  }

  private applyExpressionLayer(): void {
    const em = this.vrm.expressionManager;
    if (!em) return;
    const activeTag = this.flashTag ?? this.baseExpression;
    const preset = VRM_EXPRESSION_MAP[activeTag] ?? 'relaxed';
    for (const name of ['happy', 'sad', 'angry', 'relaxed', 'surprised']) {
      try { em.setValue(name, name === preset ? 1 : 0); } catch { /* preset 可能不存在 */ }
    }
  }

  private applyExpressionNow(tag: ExpressionTag): void {
    if (this.disposed) return;
    const em = this.vrm.expressionManager;
    if (!em) return;
    const preset = VRM_EXPRESSION_MAP[tag] ?? 'relaxed';
    try { em.setValue(preset, 1); } catch { /* preset 可能不存在 */ }
  }

  private applyLipSync(speaking: boolean, getLevel: () => number): void {
    const em = this.vrm.expressionManager;
    if (!em) return;
    const level = speaking ? Math.min(1, getLevel() * 3.2) : 0;
    try { em.setValue('aa', level); } catch { /* aa morph 可能不存在 */ }
  }

  private applyBlink(t: number, dt: number): void {
    const em = this.vrm.expressionManager;
    if (!em) return;

    if (this.blinkProgress > 0) {
      // 眨眼进行中：0 → 峰值 → 0（sin 半波）
      this.blinkProgress -= dt / this.blinkDuration;
      if (this.blinkProgress <= 0) {
        this.blinkProgress = 0;
        this.blinkNextDelay = 2 + Math.random() * 4;
      }
      const envelope = Math.sin((1 - this.blinkProgress) * Math.PI);
      try {
        em.setValue('blink', envelope);
        em.setValue('winkLeft', envelope * 0.8);
        em.setValue('winkRight', envelope * 0.8);
      } catch { /* morph 可能不存在 */ }
    } else {
      this.blinkNextDelay -= dt;
      if (this.blinkNextDelay <= 0) this.triggerBlink();
    }
  }

  private triggerBlink(): void {
    this.blinkProgress = 1;
  }
}
