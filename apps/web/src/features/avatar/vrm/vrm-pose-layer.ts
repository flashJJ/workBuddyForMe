import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import {
  TOUCH_SQUASH_MS,
  TOUCH_SQUASH_SCALE_X,
  TOUCH_SQUASH_SCALE_Y,
} from '@wbfm/shared/constants';
import {
  GAZE_IDLE_RESET_MS,
  GAZE_LIMITS,
  GAZE_SMOOTH,
  gazeAngles,
  normalizeGaze,
  rigPitchSign,
  smoothDamp,
} from '../performance/gaze';
import { relaxBothArms } from '../performance/arm-relax';
import { GestureState, ambientHeadAngles, type ProceduralGestureKind } from '../performance/gesture';
import { TurnState } from '../performance/turn';

const UP = new THREE.Vector3(0, 1, 0);
const PITCH_AXIS = new THREE.Vector3(1, 0, 0);
const ROLL_AXIS = new THREE.Vector3(0, 0, 1);
const HEAD_IDLE_PITCH = 0.12;
/** 待机颈部下压：多数模型默认颈部后仰，低机位会显得一直抬头 */
const NECK_IDLE_PITCH = 0.26;

/** 参与 gaze/wiggle 叠加的 normalized bone 引用 */
export interface NormalizedBoneRef {
  name: string;
  node: THREE.Object3D;
  baseQuat: THREE.Quaternion;
}

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

  /** mixer 本帧写的骨骼姿态（叠加前快照，避免视线逐帧累积） */
  private readonly mixerHeadQuat = new THREE.Quaternion();
  private readonly mixerSpineQuat = new THREE.Quaternion();
  private readonly mixerNeckQuat = new THREE.Quaternion();
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
    const headBone = normBones.get('head');
    this.pitchSign = headBone ? rigPitchSign(headBone.node) : 1;
    this.lastGazeAt = performance.now();
    if (headBone) this.mixerHeadQuat.copy(headBone.baseQuat);
    const spine = normBones.get('spine'); if (spine) this.mixerSpineQuat.copy(spine.baseQuat);
    const neck = normBones.get('neck');
    if (neck) this.mixerNeckQuat.copy(neck.baseQuat);
    if (vrm.lookAt) vrm.lookAt.target = this.gazeTarget;
  }

  /** 重新捕获基础变换（squash/呼吸基准）；position.y 必须记录，否则底部对齐偏移会被覆盖 */
  captureBase(): void {
    this.baseSceneScale.copy(this.vrm.scene.scale);
    this.baseSceneY = this.vrm.scene.position.y;
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
    const head = this.normBones.get('head');
    if (head) head.node.quaternion.copy(head.baseQuat);
    const spine = this.normBones.get('spine');
    if (spine) spine.node.quaternion.copy(spine.baseQuat);
    const neck = this.normBones.get('neck');
    if (neck) neck.node.quaternion.copy(neck.baseQuat);
  }

  captureMixerPose(): void {
    const head = this.normBones.get('head');
    if (head) this.mixerHeadQuat.copy(head.node.quaternion);
    const spine = this.normBones.get('spine');
    if (spine) this.mixerSpineQuat.copy(spine.node.quaternion);
    const neck = this.normBones.get('neck');
    if (neck) this.mixerNeckQuat.copy(neck.node.quaternion);
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
    this.applySpineTilt(procedural);
    this.applyNeckPitch(procedural);
    this.applyEyeTarget(headRef);
    const g = this.gesture.update();
    if (procedural) {
      this.applyProgrammaticPose(t, headRef);
    } else {
      this.applyGazeOnly(headRef);
    }
    // roll 只在头节点统一叠一次，不参与 yaw/pitch 的平滑
    const rollQ = g.roll === 0 ? null : new THREE.Quaternion().setFromAxisAngle(ROLL_AXIS, g.roll);
    if (rollQ) headRef.node.quaternion.premultiply(rollQ);
    this.decayHeadOffset();
  }

  /** 待机手臂放松（A-pose → 自然下垂）：weight 1 = 完全下垂，0 = 保持动作 */
  relaxArms(weight: number, t: number): void {
    relaxBothArms((name) => this.normBones.get(name), weight, t);
  }

  applyInteractionAngles(extraYaw: number, extraPitch: number): void {
    if (extraYaw === 0 && extraPitch === 0) return;
    const headRef = this.normBones.get('head');
    if (!headRef) return;
    const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), extraYaw);
    const pitchQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), extraPitch);
    headRef.node.quaternion.premultiply(pitchQ).premultiply(yawQ);
  }

  /** 呼吸浮动 + 身体微摆（每帧 Step 5）；clip/procedural 都保留一点身体摆动 */
  applyBodyIdle(t: number, dt: number, breatheDeep: boolean, procedural: boolean): void {
    const speed = this.sleeping ? 0.5 : 1;
    this.breathePhase += dt * speed;
    const breatheAmp = this.sleeping ? 0.006 : breatheDeep ? 0.026 : 0.016;
    this.vrm.scene.position.y = this.baseSceneY + Math.sin(this.breathePhase * 1.2) * breatheAmp;
    const sway = this.sleeping ? 0 : Math.sin(t * 0.25) * (procedural ? 0.018 : 0.012);
    this.vrm.scene.rotation.y = this.baseSceneRotationY + this.turn.update(dt) + sway;
  }

  /** 无动作池 clip 时：叠头部 wiggle + gaze + 手势（不动身体骨骼） */
  private applyProgrammaticPose(t: number, headRef: NormalizedBoneRef): void {
    const wiggleYaw = Math.sin(t * 0.5) * 0.06;
    const wigglePitch = Math.sin(t * 0.7) * 0.04;
    const yawQ = new THREE.Quaternion().setFromAxisAngle(
      UP,
      wiggleYaw + this.headYaw + this.headYawOffset + this.gesture.angles.yaw,
    );
    const pitchQ = new THREE.Quaternion().setFromAxisAngle(
      PITCH_AXIS,
      wigglePitch + this.headPitch + this.gesture.angles.pitch * this.pitchSign,
    );
    // 叠加在当前姿态之上（premultiply 保持与 idle clip 路径一致的叠加语义）
    headRef.node.quaternion.copy(headRef.baseQuat).premultiply(pitchQ).premultiply(yawQ);
  }

  /** 有动作 clip 时：只叠 gaze + clickFeedback + 手势角度（不破坏 mixer 轨道） */
  private applyGazeOnly(headRef: NormalizedBoneRef): void {
    const g = this.gesture.angles;
    if (this.headYaw === 0 && this.headPitch === 0 && this.headYawOffset === 0 && g.yaw === 0 && g.pitch === 0) return;
    const yawQ = new THREE.Quaternion().setFromAxisAngle(UP, this.headYaw + this.headYawOffset + g.yaw);
    const pitchQ = new THREE.Quaternion().setFromAxisAngle(PITCH_AXIS, this.headPitch + g.pitch * this.pitchSign);
    headRef.node.quaternion.copy(this.mixerHeadQuat).premultiply(pitchQ).premultiply(yawQ);
  }

  /** 脊柱跟随（幅度小、更慢）：程序化路径回到绑定姿态，clip 路径叠在 mixer 输出上 */
  private applySpineTilt(procedural: boolean): void {
    const spine = this.normBones.get('spine');
    if (!spine || this.spineYaw === 0) return;
    const q = new THREE.Quaternion().setFromAxisAngle(UP, this.spineYaw);
    if (procedural) {
      spine.node.quaternion.copy(spine.baseQuat).premultiply(q);
    } else {
      spine.node.quaternion.copy(this.mixerSpineQuat).premultiply(q);
    }
  }

  /** 颈部待机下压：抵消模型默认后仰，视线/交互角度仍叠加在头部 */
  private applyNeckPitch(procedural: boolean): void {
    const neck = this.normBones.get('neck');
    if (!neck) return;
    // 与头部俯仰同一套骨骼轴向标定：VRM0 为 -1、VRM1 为 +1
    const angle = NECK_IDLE_PITCH * this.pitchSign;
    const q = new THREE.Quaternion().setFromAxisAngle(PITCH_AXIS, angle);
    if (procedural) {
      neck.node.quaternion.copy(neck.baseQuat).premultiply(q);
    } else {
      neck.node.quaternion.copy(this.mixerNeckQuat).premultiply(q);
    }
  }

  /** 眼睛追踪：lookAt 目标放在头部前方，左右/上下偏移由平滑后的头部角度换算 */
  private applyEyeTarget(headRef: NormalizedBoneRef): void {
    if (!this.vrm.lookAt) return;
    headRef.node.updateWorldMatrix(true, false);
    headRef.node.getWorldPosition(this.headWorld);
    const yawRatio = this.headYaw / (GAZE_LIMITS.headYawDeg * (Math.PI / 180));
    const pitchRatio = this.headPitch / (GAZE_LIMITS.headPitchDeg * (Math.PI / 180));
    this.gazeTarget.position.set(
      this.headWorld.x + yawRatio * 0.6,
      this.headWorld.y - pitchRatio * 0.4,
      this.headWorld.z + 1,
    );
    this.gazeTarget.updateMatrixWorld(true);
  }

  /** 点击微倾指数衰减（两条叠加路径共用） */
  private decayHeadOffset(): void {
    this.headYawOffset *= 0.85;
    if (Math.abs(this.headYawOffset) < 0.003) this.headYawOffset = 0;
  }
}
