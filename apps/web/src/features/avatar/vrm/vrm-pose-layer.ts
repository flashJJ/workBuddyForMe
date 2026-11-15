import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { GAZE_IDLE_RESET_MS, GAZE_SMOOTH, normalizeGaze, rigPitchSign, smoothDamp } from '../performance/gaze';
import { GestureState, type ProceduralGestureKind } from '../performance/gesture';
import { TurnState } from '../performance/turn';
import type { NormalizedBoneRef } from '../pose/bones';
import {
  aimEyeTarget,
  applyClipHead,
  applyHeadInteraction,
  applyNeckIdlePitch,
  applyProceduralHead,
  applySpineYaw,
} from '../pose/head-overlay';
import { VrmAnimationRuntime } from '../animation/adapters/vrm';
import type { MotionContent } from '../animation';
import { collectBehaviorClaims, type BehaviorClaim } from '../animation/frame/behavior-claims';
import { maskIncludes } from '../animation/mask';
import { reapplyPalms } from '../animation/arms/solver';
import { VrmIdleOverlay } from './overlay/vrm-idle-overlay';
import { VrmScriptMotionOverlay, type ScriptMotionOptions } from './overlay/script-motion/vrm-script-motion';
import { VrmLiveliness } from './overlay/vrm-liveliness';
import { VrmHandClearance } from './overlay/vrm-hand-clearance';
import { VrmStageStance } from './overlay/vrm-stage-stance';
import { VrmSquash } from './overlay/vrm-squash';
import { VrmSeating } from './overlay/vrm-seating';
import { VrmPreviewPose } from './overlay/preview/vrm-preview-pose';
import type { SeatAnchor } from '../animation/seating';
import { DEFAULT_LIVELINESS, type LivelinessParams } from '../animation/liveliness';
import { createVrmMorphExecutor } from '../animation/adapters/vrm-morph';
import { resolveGazeTarget } from '../pose/gaze-resolver';
import type { RunnerSnapshot } from '../animation/behavior';
import type { BehaviorDebugSnapshot } from '../animation/observability';
import type { MorphDebugSnapshot } from '../animation/morph';

export type { NormalizedBoneRef } from '../pose/bones';

const ROLL_AXIS = new THREE.Vector3(0, 0, 1);
const OVERLAY_BONES = ['head', 'spine', 'neck'] as const;

/** 姿态叠加层：squash / 头部叠加（视线/手势/转身）/ 呼吸与身体微摆，全部叠加在动画之上 */
export class VrmPoseLayer {
  private readonly vrm: VRM;
  private readonly normBones: Map<string, NormalizedBoneRef>;

  private baseSceneY = 0;
  /** 基准朝向：VRM0 经 rotateVRM0 后为 π，微摆必须在其上叠加 */
  private baseSceneRotationY = 0;
  private gazeNx = 0;
  private gazeNy = 0;
  private lastGazeAt = 0;
  private headYaw = 0;
  private headPitch = 0;
  private spineYaw = 0;
  private headYawOffset = 0; // 点击头部微倾
  private sleeping = false;
  private stageMode = false; // 展示面：保留自然垂臂，不跑手指 fidget
  private readonly stageStance = new VrmStageStance();
  /** 俯仰旋转方向：VRM0 为 -1、VRM1 为 +1（按头部世界 X 轴标定） */
  private readonly pitchSign: number;
  /** 程序化手势（点头/歪头/瞥一眼）：动作池为空或环境调度触发 */
  private readonly gesture = new GestureState();
  /** 背对/转身（久无交互 → π，被交互 → 0） */
  private readonly turn = new TurnState();
  /** M0c：行为/姿势分层库的 VRM 运行时（骨架快照 + Composer + root 偏移） */
  private readonly anim: VrmAnimationRuntime;
  private readonly previewPose = new VrmPreviewPose(() => this.anim);
  private readonly idleOverlay: VrmIdleOverlay; private readonly scriptMotionOverlay: VrmScriptMotionOverlay; // 待机重心/触摸反应 + 剧本动作
  private readonly liveliness: VrmLiveliness; // 呼吸 / 不对称 / 微扰
  private readonly handClearance: VrmHandClearance; // 抱手/拥抱防穿模
  private readonly squash: VrmSquash; // 触摸 squash 包络
  private readonly seating: VrmSeating; // 坐窗沿/坐桌沿（高度锚点 + 腿部 IK）
  private baseSceneRotationZ = 0;
  /** VRM lookAt 的眼睛目标（独立对象，不参与取景包围盒） */
  private readonly gazeTarget = new THREE.Object3D();
  private readonly headWorld = new THREE.Vector3();
  private breathePhase = 0;
  /** 舞台相对位置朝向（左右角色向内微转） */
  private facingYaw = 0; private facingCurrent = 0;
  constructor(
    vrm: VRM,
    normBones: Map<string, NormalizedBoneRef>,
    /** v4.0 M4：会话内容快照；缺省使用内置内容 */
    content?: MotionContent,
  ) {
    this.vrm = vrm;
    this.normBones = normBones;
    this.baseSceneRotationY = vrm.scene.rotation.y; // rotateVRM0 的 π 必须先记录
    this.baseSceneRotationZ = vrm.scene.rotation.z;
    const headBone = normBones.get('head');
    this.pitchSign = headBone ? rigPitchSign(headBone.node) : 1;
    this.lastGazeAt = performance.now();
    this.anim = new VrmAnimationRuntime(normBones, content);
    this.anim.captureBase();
    this.idleOverlay = new VrmIdleOverlay(this.anim); this.scriptMotionOverlay = new VrmScriptMotionOverlay(this.anim);
    this.liveliness = new VrmLiveliness(normBones, this.anim, DEFAULT_LIVELINESS);
    this.handClearance = new VrmHandClearance(normBones, this.anim);
    this.squash = new VrmSquash(vrm);
    this.seating = new VrmSeating(vrm, normBones, this.anim);
    const morph = createVrmMorphExecutor(vrm);
    if (morph) {
      this.anim.attachMorph(morph);
      if (!morph.available) console.warn(`[motion] 行为表情停用：${morph.warning ?? '未知原因'}`);
    }
    if (vrm.lookAt) vrm.lookAt.target = this.gazeTarget;
  }
  /** 重新捕获基础变换（squash/呼吸基准）；position.y 必须记录，否则底部对齐偏移会被覆盖 */
  captureBase(): void {
    this.squash.captureBase();
    this.baseSceneY = this.vrm.scene.position.y;
    this.anim.captureBase();
  }
  playSquash(): void { this.squash.play(); } setFacing(yaw: number): void { this.facingYaw = Number.isFinite(yaw) ? yaw : 0; }
  setGaze(nx: number, ny: number): void {
    const [x, y] = normalizeGaze(nx, ny);
    this.gazeNx = x;
    this.gazeNy = y;
    this.lastGazeAt = performance.now();
  }
  /** v3.0 P1：睡眠时收起视线并低头（闭眼由脸层负责） */
  setSleeping(sleeping: boolean): void {
    this.sleeping = sleeping;
    if (sleeping) { this.gazeNx = 0; this.gazeNy = 0; }
  }
  resetOverlayBones(): void {
    for (const name of OVERLAY_BONES) {
      const ref = this.normBones.get(name);
      if (ref) ref.node.quaternion.copy(ref.baseQuat);
    }
  }

  captureMixerPose(): void { this.anim.captureFrame(); } rememberFrame(): void { this.anim.rememberFrame(); }
  nudgeHead(): void { this.headYawOffset = (Math.random() - 0.5) * 0.15; } playGesture(kind: ProceduralGestureKind): void { this.gesture.play(kind); }
  /** 触摸反应（L2 一次性动作）；返回 false 表示动作缺失，可回退其他手势 */
  playReaction(id: string, durationMs = 720): boolean { return this.idleOverlay.playReaction(id, durationMs); }
  /** P8 桥接点 3：剧本动作专用槽位（全身体，不与触摸反应互抢）；返回 false = 未注册 */
  playScriptMotion(id: string, options?: ScriptMotionOptions): boolean { this.previewPose.clear(); return this.scriptMotionOverlay.play(id, options); }
  stopScriptMotion(id?: string): boolean { return this.scriptMotionOverlay.stop(id); }

  /** T2.6：自然度参数；tension 由 VrmController 每帧按交互状态派生（Step 0.6） */
  setLiveliness(patch: Partial<LivelinessParams>): void { this.liveliness.setParams(patch); }
  get reacting(): boolean { return this.idleOverlay.reacting; }
  get reaction(): string | null { return this.idleOverlay.reactionId; }
  get accent(): string | null { return this.idleOverlay.accentId; } get scriptMotion(): string | null { return this.scriptMotionOverlay.motionId; }
  motionDuration(id: string): number { return this.anim.motions.get(id)?.durationMs ?? 0; }
  /** 久无交互背对 / 被交互转回 */
  setFaceAway(away: boolean): void { if (away) this.gesture.reset(); this.turn.setAway(away); } setScriptBusy(busy: boolean): void { this.idleOverlay.setScriptBusy(busy); } setStageStance(on: boolean): void { this.stageMode = on; this.stageStance.setEnabled(on); }
  /** 被拎起 / 放下：强制接管，松手立即进 land，不排队等 exit */
  setRaised(raised: boolean): void { if (raised) this.anim.play('behavior.lifted', true); else if (this.raised) this.anim.play('behavior.land', true); }
  get raised(): boolean { return this.anim.snapshot.id === 'behavior.lifted'; }

  /** M0c：播放/停止分层行为（enter → loop → exit 由 runtime 推进） */
  playBehavior(id: string): boolean { this.previewPose.clear(); return this.anim.play(id); }
  /** 场景 cue：强制接管并清空队列，避免连续点击堆队列 */
  playBehaviorNow(id: string): boolean { this.previewPose.clear(); return this.anim.play(id, true); }
  stopBehavior(id?: string, clearQueue = false): boolean { if (id && this.anim.snapshot.id !== id) return false; return this.anim.stop(clearQueue); }
  get behavior(): Readonly<RunnerSnapshot> { return this.anim.snapshot; }

  /** 帧台账：本帧行为轨道写到的区域（只读投影，不改变执行） */
  get behaviorClaims(): readonly BehaviorClaim[] { return collectBehaviorClaims(this.anim.runner); }

  /** T1.8：行为观测快照（dev 预览面板 / __petDebug.behaviors） */
  get behaviorDebug(): BehaviorDebugSnapshot { return this.anim.debug; }

  /** T2.2：语义表情通道（dev 预览/后续 morph 轨道）；null 释放 */
  setMorphChannels(channels: Readonly<Record<string, number>> | null): void {
    this.anim.setMorphChannels(channels);
  }

  /** T2.2：在 vrm.update 之后、render 之前写 morph */
  applyMorph(): number {
    return this.anim.applyMorph();
  }

  get morphDebug(): MorphDebugSnapshot | null { return this.anim.morph; }

  /** squash 包络（每帧 Step 2） */
  applySquash(): void {
    this.squash.update();
  }

  /** T2.5：坐窗沿 / 坐桌沿（高度锚点 + 腿部端点 IK）；null 恢复站立 */
  setSeat(anchor: SeatAnchor | null): void {
    this.seating.setAnchor(anchor);
  }

  /** v3.0 P4：Q 版缩放后重测坐姿尺寸 */
  refreshSeating(): void {
    this.seating.refreshRig();
  }

  get seated(): boolean { return this.seating.active; }

  /** 头部叠加层（每帧 Step 4）：平滑追踪 + 脊柱微转 + lookAt 眼睛目标 */
  applyHeadOverlay(t: number, procedural: boolean, dt: number, gazeWeight: number): void {
    // 世界方向手臂意图跟随转身：背对时左右手不会镜像到身体中线
    this.anim.setFrameYaw(this.turn.yaw + this.anim.root.yaw);
    this.anim.update(dt * 1000);
    // 待机重心换脚 / 触摸反应：剧本动作激活时让位（独立槽位，P8 桥接点 3）
    this.idleOverlay.update(t, procedural, this.sleeping || this.turn.away || this.seating.active, this.scriptMotionOverlay.active);
    // 坐姿层在待机层之后：坐姿覆盖腿/脊柱，再对脚踝做端点 IK
    this.seating.update(dt);
    // 剧本动作最后写：全身 mask，覆盖待机/坐姿；非循环动作结尾自动淡出
    this.scriptMotionOverlay.update(dt * 1000);
    const headRef = this.normBones.get('head');
    if (!headRef) return;
    // 睡眠 / 背对时收起常规视线与环境漂移；行为 look 轨道可覆盖背对静默
    const muted = this.sleeping || this.turn.away;
    const target = resolveGazeTarget({
      t,
      pointerX: this.gazeNx,
      pointerY: this.gazeNy,
      gazeWeight,
      idle: performance.now() - this.lastGazeAt > GAZE_IDLE_RESET_MS,
      muted,
      sleeping: this.sleeping,
      look: this.anim.activeLookTarget,
      lookWeight: this.anim.activeLookWeight,
      pitchSign: this.pitchSign,
    });
    this.headYaw = smoothDamp(this.headYaw, target.headYaw, GAZE_SMOOTH.head, dt);
    this.headPitch = smoothDamp(this.headPitch, target.headPitch, GAZE_SMOOTH.head, dt);
    this.spineYaw = smoothDamp(this.spineYaw, target.spineYaw, GAZE_SMOOTH.spine, dt);
    this.applySpineTilt();
    this.applyNeckPitch();
    this.applyEyeTarget(headRef);
    const g = this.gesture.update();
    const { headYaw, headPitch, headYawOffset, pitchSign } = this;
    if (procedural) applyProceduralHead(headRef, t, headYaw, headPitch, headYawOffset, g, pitchSign);
    else applyClipHead(headRef, headYaw, headPitch, headYawOffset, g, pitchSign);
    // roll 只在头节点统一叠一次，不参与 yaw/pitch 的平滑
    const rollQ = g.roll === 0 ? null : new THREE.Quaternion().setFromAxisAngle(ROLL_AXIS, g.roll);
    if (rollQ) headRef.node.quaternion.premultiply(rollQ);
    this.decayHeadOffset();
  }
  /** 待机手臂放松（A-pose → 自然下垂）+ 手部微动作组件；目标随转身角旋转，避免背对时双手收到中线 */
  relaxArms(weight: number, t: number): void {
    this.anim.applyPose('pose.arms-hang', weight, t, true, this.turn.yaw + this.anim.root.yaw);
    if (this.stageMode) return; // 舞台只保留垂臂：握拳/摊开会覆盖 daiji 腕姿
    // 左右手错开半个周期：一只手握拳/摊开时，另一只保持放松
    this.anim.applyMotion('motion.hand-fidget-left', t * 1000, weight);
    this.anim.applyMotion('motion.hand-fidget-right', t * 1000, weight, 3200);
  }

  applyPropHold(poseId: string): void { const gripOnly = this.behaviorClaims.some((claim) => maskIncludes(claim.mask, 'rightArm')); this.anim.applyPose(gripOnly ? 'pose.hand-right-cup-hold' : poseId, 1, 0, false); }

  /** v4.0：内容包姿势预览（限时叠加，到期自动释放） */
  playPose(id: string, holdMs = 2400): boolean { return this.previewPose.play(id, holdMs); }

  applyInteractionAngles(extraYaw: number, extraPitch: number): void {
    const head = this.normBones.get('head');
    if (head) applyHeadInteraction(head, extraYaw, extraPitch);
  }
  /** 呼吸浮动 + 身体微摆（每帧 Step 5）；root 轨道叠加在基准变换之上 */
  applyBodyIdle(t: number, dt: number, breatheDeep: boolean, procedural: boolean): void {
    const speed = this.sleeping ? 0.5 : 1;
    this.breathePhase += dt * speed;
    const breatheAmp = this.sleeping ? 0.006 : breatheDeep ? 0.026 : 0.016;
    const root = this.anim.root;
    this.vrm.scene.position.y =
      this.baseSceneY + Math.sin(this.breathePhase * 1.2) * breatheAmp + root.y - this.seating.depth;
    const sway = this.sleeping ? 0 : Math.sin(t * 0.25) * (procedural ? 0.018 : 0.012);
    this.facingCurrent = smoothDamp(this.facingCurrent, this.facingYaw, 5, dt);
    this.vrm.scene.rotation.y =
      this.baseSceneRotationY + this.turn.update(dt) + sway + root.yaw + this.facingCurrent;
    this.vrm.scene.rotation.z = this.baseSceneRotationZ + root.roll;
    this.stageStance.apply(this.normBones);
    this.liveliness.update(dt, this.sleeping);
    this.handClearance.update(dt, this.sleeping);
    reapplyPalms(this.normBones); // 掌心的最后写者：呼吸/防穿模调整上臂之后重新滚腕
    this.previewPose.apply(performance.now());
  }

  /** 脊柱跟随（幅度小、更慢）：叠加在当前姿态上，行为姿势不会被覆盖 */
  private applySpineTilt(): void {
    const spine = this.normBones.get('spine');
    if (!spine || this.spineYaw === 0) return;
    applySpineYaw(spine, this.spineYaw);
  }

  /** 颈部待机下压：抵消模型默认后仰，视线/交互角度仍叠加在头部 */
  private applyNeckPitch(): void {
    const neck = this.normBones.get('neck');
    if (neck) applyNeckIdlePitch(neck, this.pitchSign);
  }

  /** 眼睛追踪：lookAt 目标放在头部前方，左右/上下偏移由平滑后的头部角度换算 */
  private applyEyeTarget(headRef: NormalizedBoneRef): void {
    const enabled = Boolean(this.vrm.lookAt);
    aimEyeTarget(enabled, headRef, this.headYaw, this.headPitch, this.gazeTarget, this.headWorld);
  }

  /** 点击微倾指数衰减（两条叠加路径共用） */
  private decayHeadOffset(): void {
    this.headYawOffset *= 0.85;
    if (Math.abs(this.headYawOffset) < 0.003) this.headYawOffset = 0;
  }
}
