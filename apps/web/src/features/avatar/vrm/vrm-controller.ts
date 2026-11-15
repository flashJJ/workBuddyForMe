'use client';

import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import type { InteractionKind, MotionSelectionContext } from '@wbfm/shared/schemas';
import type { ExpressionTag } from '../expression/expression-parser';
import { MotionMixer, type MotionRotationConfig } from './vrm-motion-mixer';
import { VrmFaceLayer } from './vrm-face-layer';
import { VrmInteractionState, type InteractionPhase } from './vrm-interaction-state';
import { VrmPoseLayer, type NormalizedBoneRef } from './vrm-pose-layer';
import { VrmAmbient } from './overlay/vrm-ambient';
import { VrmTension } from './overlay/vrm-tension';
import { prepareVrmModel, VrmTailLayer } from './asset';
import { pickMotionGesture, pickTapGesture } from '../performance/gesture';
import type { MotionPoolEntry } from '../motion/motion-segments';
import { NORM_BONE_NAMES } from '../pose/bones';
import type { VrmControllerLike } from './session/vrm-controller-like';
import { applyChibi, groundFeet } from './chibi/apply-chibi';
import { VrmFrameLedger } from './overlay/vrm-frame-ledger';
import { VrmPropLayer } from './props/vrm-prop-layer';
import type { MotionContent } from '../animation';

export type { MotionRotationConfig } from './vrm-motion-mixer';
export type { VrmControllerLike } from './session/vrm-controller-like';

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
 *   interaction → mixer → squash/flash → 头部叠加 → 呼吸 → vrm.update → 表情 preset → 口型/眨眼 → 行为语义表情 → render（每步含义见 update 内注释）
 */
export class VrmController implements VrmControllerLike {
  private readonly vrm: VRM;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly clock: THREE.Clock;
  private readonly mixer: MotionMixer;
  private readonly face: VrmFaceLayer;
  private readonly pose: VrmPoseLayer; private readonly props: VrmPropLayer;
  private readonly tail: VrmTailLayer;
  private readonly interaction = new VrmInteractionState();
  private lastPhase: InteractionPhase = 'idle';
  /** 环境微行为计时（眨眼 / 点头 / 歪头 / 瞥视） */
  private readonly ambient = new VrmAmbient(
    () => this.face.triggerBlink(),
    (kind) => this.pose.playGesture(kind),
  );
  /** T2.6：自然度张力，跟随交互状态平滑变化（见 Step 0.6） */
  private readonly tension = new VrmTension();
  /** 帧台账：区域 → 写者/优先级/意图（只记录，不拦截） */
  private readonly frames: VrmFrameLedger;
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
    /** v4.0 M4：本次会话的动效内容快照；缺省使用内置表 */
    motionContent?: MotionContent,
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

    this.pose = new VrmPoseLayer(vrm, normBones, motionContent);
    this.frames = new VrmFrameLedger(this.pose);
    this.face = new VrmFaceLayer(vrm);
    this.tail = new VrmTailLayer(vrm);
    this.mixer = new MotionMixer(vrm, gltfAnimations, motionPool, rotationConfig); this.props = new VrmPropLayer(vrm, scene, () => this.pose.applyPropHold('pose.prop-hold'));
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
    // 关键：三段式收尾时强制取消临时表情，否则 ActionChain 的 flashExpression 会独立挂着不走
    if (this.interaction.end()) this.face.clearFlash();
  }

  playSquash(): void {
    if (this.disposed) return;
    this.pose.playSquash();
  }

  flashExpression(tag: ExpressionTag, durationMs: number, intensity: 1 | 2 | 3 = 2): void {
    if (this.disposed) return;
    this.face.flashExpression(tag, durationMs, intensity);
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
    if (!sleeping) this.ambient.reset();
    this.pose.setSleeping(sleeping);
    this.face.setSleeping(sleeping);
    this.mixer.setSleeping(sleeping);
  }

  /** v3.5：久无交互背对 / 被交互转回（只影响 VRM；Live2D 无此 API） */
  setFaceAway(away: boolean): void { if (this.disposed) return; this.faceAway = away; this.pose.setFaceAway(away); } setScriptBusy(busy: boolean): void { if (!this.disposed) this.pose.setScriptBusy(busy); }  setStageStance(on: boolean): void { if (!this.disposed) this.pose.setStageStance(on); }
  /** 舞台相对位置朝向：左右角色向内微转（弧度，0 = 正向） */
  setStageFacing(yaw: number): void { if (!this.disposed) this.pose.setFacing(yaw); }
  /** 被拎起：向上拖拽时进入悬空姿态，松手回弹 */
  setRaised(raised: boolean): void { if (!this.disposed) this.pose.setRaised(raised); }

  /** M0c：播放/停止 L3 分层行为（behavior.*），enter/loop/exit 由动效库单时钟推进 */
  playBehavior(id: string): boolean { return !this.disposed && this.pose.playBehavior(id); }
  /** 场景 cue：强制接管，清空排队行为，避免连续点击拥塞 */
  playBehaviorNow(id: string): boolean { return !this.disposed && this.pose.playBehaviorNow(id); }
  stopBehavior(id?: string, clearQueue = false): boolean { return !this.disposed && this.pose.stopBehavior(id, clearQueue); }

  /** 坐窗沿/坐桌沿：高度锚点 + 腿部端点 IK；null 恢复站立 */
  setSeat(mode: 'sill' | 'desk' | null): void { if (!this.disposed) this.pose.setSeat(mode ? { mode } : null); }

  /** v3.0 P4：Q 版骨架缩放（关闭即还原） */
  setChibi(on: boolean): void { if (this.disposed) return; applyChibi(this.vrm, on); this.pose.refreshSeating(); this.captureBaseScale(); }  /** v3.0 P4：Q 版缩腿后按当前骨架把脚底重新贴地（坐姿交给座位下沉） */
  alignFeetToGround(): void {
    if (!this.disposed && !this.pose.seated) groundFeet(this.vrm);
  }

  /** M0d T2.2：语义表情预览（dev 面板）；null 释放所有通道 */
  setMorphChannels(channels: Record<string, number> | null): void { if (!this.disposed) this.pose.setMorphChannels(channels); }

  /** 帧台账：区域 → 写者/优先级/意图（dev 排查越改越乱用） */
  get frameDebug() { return this.frames.snapshot; }
  /** S1 道具原型：attach/detach 程序化茶杯（dev 入口） */
  attachProp(id: string, on = true): Promise<boolean> { return this.disposed ? Promise.resolve(false) : on ? this.props.attach(id) : Promise.resolve(this.props.detach(id)); }
  showProp(id: string, on = true): Promise<boolean> { return this.disposed ? Promise.resolve(false) : on ? this.props.show(id) : Promise.resolve(this.props.hide(id)); }
  /** 点击触发：先播触摸反应；无 VRMA 手势时用内部 MOTION 兜底 */
  tap(): void {
    if (this.disposed) return;
    const reacted = this.pose.playReaction('motion.react-flinch');
    if (!reacted && this.mixer.poolSize > 1 && this.mixer.playRandomGesture()) return;
    if (!reacted && this.playMotion(pickMotionGesture())) { this.face.triggerBlink(); return; }
    if (!reacted) this.pose.playGesture(pickTapGesture());
    this.pose.nudgeHead();
    this.face.triggerBlink();
  }
  /** 内部 MOTION 一次性回退（无 VRMA 手势时）；返回 false 表示动作不存在 */
  playMotion(id: string): boolean { const duration = this.pose.motionDuration(id); return duration > 0 && this.pose.playReaction(id, duration); }
  /** P8 桥接点 3：剧本动作专用槽（全身体，独立于触摸反应）；返回 false = 未注册 */
  playScriptMotion(id: string, options?: { loop?: boolean; fadeMs?: number }): boolean { return !this.disposed && this.pose.playScriptMotion(id, options); }
  stopScriptMotion(id?: string): boolean { return !this.disposed && this.pose.stopScriptMotion(id); }

  setLipLevel(level: number): void { if (!this.disposed) this.face.setLipLevel(level); }
  setExpression(tag: ExpressionTag, intensity: 1 | 2 | 3 = 2): void { if (!this.disposed) this.face.setExpression(tag, intensity); }
  /** 注意：renderer 和 scene 的 dispose 由 vrm-canvas.tsx 的 disposeVrm 统一处理 */
  dispose(): void { if (this.disposed) return; this.disposed = true; this.mixer.dispose(); this.props.dispose(); }

  // ======= 核心 update（固定 10 步） =======

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

    // --- Step 0.6: 自然度张力跟随交互状态（睡眠 < 待机 < 说话 < 行为 < 触摸 < 拎起）---
    const state = { sleeping: this.sleeping, raised: this.pose.raised, touching: this.pose.reacting || this.interaction.currentPhase !== 'idle', behavior: this.pose.behavior.id !== null, speaking, faceAway: this.faceAway };
    this.pose.setLiveliness({ tension: this.tension.tick(dt, state) });

    // --- Step 0.7: 叠加骨骼复位（mixer 未驱动的轨道不残留上一帧视线）---
    this.pose.resetOverlayBones();
    this.pose.rememberFrame(); // 缓存上一帧最终手臂姿势，供帧内行为切换（lifted→land）交叉淡化

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
    // v3.0 P1：待机时把 A-pose 手臂收成自然下垂；clip 自带手臂动画时让位，手势/长按/被拎起/触摸反应/行为期间不干预
    const relaxable = !this.mixer.hasGesture && !this.interaction.isLooping && !this.pose.raised && !this.pose.reacting && !this.pose.seated && this.pose.behavior.id === null && this.pose.accent === null && this.pose.scriptMotion === null;
    const relaxWeight = !relaxable ? 0 : procedural ? 1 : this.mixer.idleClipAnimatesArms ? 0 : 1; const propHold = this.props.hold;
    this.frames.beginFrame({ procedural, gazeWeight, relaxWeight, accent: this.pose.accent, reaction: this.pose.reaction, propHold, scriptMotion: this.pose.scriptMotion });
    if (relaxWeight > 0 && this.frames.allows('idle:relax')) this.pose.relaxArms(relaxWeight, t);

    // --- Step 5: 呼吸 + 身体微摆（交互 loop 阶段加深呼吸） ---
    this.pose.applyBodyIdle(t, dt, this.interaction.isLooping, procedural);
    if (propHold && this.frames.allows('prop:hold')) this.pose.applyPropHold(propHold.pose); this.frames.commit(performance.now());
    // --- Step 5.5: 环境微行为（眨眼/点头/歪头/瞥视），避免待机像摆件 ---
    this.ambient.tick(performance.now(), !this.sleeping && !this.faceAway && !this.mixer.hasGesture && this.interaction.currentPhase === 'idle');

    // --- Step 6: vrm.update → normalized → raw → 场景 + SpringBone ---
    // normalized bone 在 Step 4 已写好；vrm.update 同步到 raw、应用到 mesh 并驱动 SpringBone
    this.vrm.update(dt);
    // 非 humanoid 且未配 SpringBone 的尾巴：程序化小幅摆动
    this.tail.update(t); this.props.update(dt * 1000);

    // --- Step 7: morph 表情层 ---
    this.face.applyExpressionLayer(speaking);

    // --- Step 8: 口型 aa ---
    this.face.applyLipSync(speaking, getLevel);

    // --- Step 9: 程序化眨眼 ---
    this.face.applyBlink(dt);

    // --- Step 9.5: 行为语义表情（T2.2）---
    // 放在 vrm.update 与表情层之后：只写 binding 的非保留通道，下一帧 preset 会重新应用
    this.pose.applyMorph();

    // --- Step 10: render ---
    this.renderer.render(this.scene, this.camera);
  }
}
