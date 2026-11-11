import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import {
  TOUCH_SQUASH_MS,
  TOUCH_SQUASH_SCALE_X,
  TOUCH_SQUASH_SCALE_Y,
} from '@wbfm/shared/constants';
import {
  GAZE_IDLE_RESET_MS,
  GAZE_SMOOTH,
  gazeAngles,
  normalizeGaze,
  rigPitchSign,
  smoothDamp,
} from '../performance/gaze';
import { GestureState, ambientHeadAngles, type ProceduralGestureKind } from '../performance/gesture';
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
import type { RunnerSnapshot } from '../animation/behavior';
import type { BehaviorDebugSnapshot } from '../animation/observability';

export type { NormalizedBoneRef } from '../pose/bones';

const ROLL_AXIS = new THREE.Vector3(0, 0, 1);
const HEAD_IDLE_PITCH = 0.12;
const OVERLAY_BONES = ['head', 'spine', 'neck'] as const;

/** 姿态叠加层：squash / 头部叠加（视线/手势/转身）/ 呼吸与身体微摆，全部叠加在动画之上 */
export class VrmPoseLayer {
  private readonly vrm: VRM;
  private readonly normBones: Map<string, NormalizedBoneRef>;

  private squashStart = 0;
  /** fitVrmToCamera 设置的基础 scale，squash 在其之上叠加 */
  private readonly baseSceneScale: THREE.Vector3;
  /** fitVrmToCamera 设置的基准 position.y（呼吸浮动以它为基准叠加，不可直接覆盖） */
  private baseSceneY = 0;
  /** 基准朝向：VRM0 经 rotateVRM0 后为 π，微摆必须在其上叠加 */
  private baseSceneRotationY = 0;

  private gazeNx = 0;
  private gazeNy = 0;
  private lastGazeAt = 0;
  /** 平滑后的头部/脊柱叠加角度 */
  private headYaw = 0;
  private headPitch = 0;
  private spineYaw = 0;
  private headYawOffset = 0; // 点击头部微倾
  private sleeping = false;
  /** 俯仰旋转方向：VRM0 为 -1、VRM1 为 +1（按头部世界 X 轴标定） */
  private readonly pitchSign: number;
  /** 程序化手势（点头/歪头/瞥一眼）：动作池为空或环境调度触发 */
  private readonly gesture = new GestureState();
  /** 背对/转身（久无交互 → π，被交互 → 0） */
  private readonly turn = new TurnState();
  /** M0c：行为/姿势分层库的 VRM 运行时（骨架快照 + Composer + root 偏移） */
  private readonly anim: VrmAnimationRuntime;
  private baseSceneRotationZ = 0;

  /** VRM lookAt 的眼睛目标（独立对象，不参与取景包围盒） */
  private readonly gazeTarget = new THREE.Object3D();
  private readonly headWorld = new THREE.Vector3();

  private breathePhase = 0;

  constructor(vrm: VRM, normBones: Map<string, NormalizedBoneRef>) {
    this.vrm = vrm;
    this.normBones = normBones;
    // 捕获 fitVrmToCamera 之后的基础 scale，squash 在其之上叠加
    this.baseSceneScale = vrm.scene.scale.clone();
    // 朝向必须在首帧前记录：rotateVRM0 写的 π 一旦被微摆覆盖就再也回不来
    this.baseSceneRotationY = vrm.scene.rotation.y;
    this.baseSceneRotationZ = vrm.scene.rotation.z;
    const headBone = normBones.get('head');
    this.pitchSign = headBone ? rigPitchSign(headBone.node) : 1;
    this.lastGazeAt = performance.now();
    this.anim = new VrmAnimationRuntime(normBones);
    this.anim.captureBase();
    if (vrm.lookAt) vrm.lookAt.target = this.gazeTarget;
  }

  /** 重新捕获基础变换（squash/呼吸基准）；position.y 必须记录，否则底部对齐偏移会被覆盖 */
  captureBase(): void {
    this.baseSceneScale.copy(this.vrm.scene.scale);
    this.baseSceneY = this.vrm.scene.position.y;
    this.anim.captureBase();
  }

  playSquash(): void {
    this.squashStart = performance.now();
  }

  setGaze(nx: number, ny: number): void {
    const [x, y] = normalizeGaze(nx, ny);
    this.gazeNx = x;
    this.gazeNy = y;
    this.lastGazeAt = performance.now();
  }

  /** v3.0 P1：睡眠时收起视线并低头（闭眼由脸层负责） */
  setSleeping(sleeping: boolean): void {
    this.sleeping = sleeping;
    if (sleeping) {
      this.gazeNx = 0;
      this.gazeNy = 0;
    }
  }

  resetOverlayBones(): void {
    for (const name of OVERLAY_BONES) {
      const ref = this.normBones.get(name);
      if (ref) ref.node.quaternion.copy(ref.baseQuat);
    }
  }

  captureMixerPose(): void {
    this.anim.captureFrame();
  }

  nudgeHead(): void {
    this.headYawOffset = (Math.random() - 0.5) * 0.15;
  }

  /** 播放一个程序化手势（动作池为空时的点击 / 环境调度） */
  playGesture(kind: ProceduralGestureKind): void {
    this.gesture.play(kind);
  }

  /** 久无交互背对 / 被交互转回 */
  setFaceAway(away: boolean): void {
    if (away) this.gesture.reset();
    this.turn.setAway(away);
  }

  /** 被拎起 / 放下：L3 行为接管，释放时排队落地缓冲 */
  setRaised(raised: boolean): void {
    if (raised) {
      this.anim.play('behavior.lifted');
      return;
    }
    if (this.anim.stop()) this.anim.play('behavior.land');
  }

  get raised(): boolean {
    return this.anim.snapshot.id === 'behavior.lifted';
  }

  /** M0c：播放/停止分层行为（enter → loop → exit 由 runtime 推进） */
  playBehavior(id: string): boolean {
    return this.anim.play(id);
  }

  stopBehavior(): boolean {
    return this.anim.stop();
  }

  get behavior(): Readonly<RunnerSnapshot> {
    return this.anim.snapshot;
  }

  /** T1.8：行为观测快照（dev 预览面板 / __petDebug.behaviors） */
  get behaviorDebug(): BehaviorDebugSnapshot {
    return this.anim.debug;
  }

  /** squash 包络（每帧 Step 2） */
  applySquash(): void {
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

  /** 头部叠加层（每帧 Step 4）：平滑追踪 + 脊柱微转 + lookAt 眼睛目标 */
  applyHeadOverlay(t: number, procedural: boolean, dt: number, gazeWeight: number): void {
    this.anim.update(dt * 1000);
    const headRef = this.normBones.get('head');
    if (!headRef) return;
    const idle = performance.now() - this.lastGazeAt > GAZE_IDLE_RESET_MS;
    // 睡眠 / 背对时收起视线与环境漂移，避免「背对着还盯着人」
    const muted = this.sleeping || this.turn.away;
    const weight = muted ? 0 : gazeWeight;
    const target = gazeAngles(idle ? 0 : this.gazeNx, idle ? 0 : this.gazeNy, weight);
    if (this.sleeping) target.headPitch += HEAD_IDLE_PITCH;
    // 环境漂移：待机时头部有极低频的「活人感」；睡眠/背对时收起
    const ambient = muted ? { yaw: 0, pitch: 0 } : ambientHeadAngles(t);
    this.headYaw = smoothDamp(this.headYaw, target.headYaw + ambient.yaw, GAZE_SMOOTH.head, dt);
    this.headPitch = smoothDamp(
      this.headPitch,
      target.headPitch * this.pitchSign + ambient.pitch,
      GAZE_SMOOTH.head,
      dt,
    );
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

  /** 待机手臂放松（A-pose → 自然下垂）：weight 1 = 完全下垂，0 = 保持动作 */
  relaxArms(weight: number, t: number): void {
    this.anim.applyPose('pose.arms-hang', weight, t);
  }

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
      this.baseSceneY + Math.sin(this.breathePhase * 1.2) * breatheAmp + root.y;
    const sway = this.sleeping ? 0 : Math.sin(t * 0.25) * (procedural ? 0.018 : 0.012);
    this.vrm.scene.rotation.y = this.baseSceneRotationY + this.turn.update(dt) + sway + root.yaw;
    this.vrm.scene.rotation.z = this.baseSceneRotationZ + root.roll;
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
