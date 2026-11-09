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
  smoothDamp,
} from '../performance/gaze';
import { relaxArm } from '../performance/arm-relax';

const UP = new THREE.Vector3(0, 1, 0);
const PITCH_AXIS = new THREE.Vector3(1, 0, 0);
const HEAD_IDLE_PITCH = 0.12;

/** 参与 gaze/wiggle 叠加的 normalized bone 引用 */
export interface NormalizedBoneRef {
  name: string;
  node: THREE.Object3D;
  baseQuat: THREE.Quaternion;
}

/**
 * 姿态叠加层协作者（由 VrmController 外迁）。
 *
 * 负责三类「在动画之上叠加、但不动动画轨道」的东西：
 * 1. squash 形变（触摸反馈的 scale sin 包络，210ms）；
 * 2. 头部叠加（视线跟随 gaze / 点击微倾 / 程序化 wiggle / 交互三段式微倾）；
 * 3. 呼吸浮动与身体微摆（scene.position.y / rotation.y）。
 */
export class VrmPoseLayer {
  private readonly vrm: VRM;
  private readonly normBones: Map<string, NormalizedBoneRef>;

  private squashStart = 0;
  /** fitVrmToCamera 设置的基础 scale，squash 在其之上叠加 */
  private readonly baseSceneScale: THREE.Vector3;
  /** fitVrmToCamera 设置的基准 position.y（呼吸浮动以它为基准叠加，不可直接覆盖） */
  private baseSceneY = 0;

  private gazeNx = 0;
  private gazeNy = 0;
  private lastGazeAt = 0;
  /** 平滑后的头部/脊柱叠加角度 */
  private headYaw = 0;
  private headPitch = 0;
  private spineYaw = 0;
  private headYawOffset = 0; // 点击头部微倾
  private sleeping = false;

  /** mixer 本帧写的骨骼姿态（叠加前快照，避免视线逐帧累积） */
  private readonly mixerHeadQuat = new THREE.Quaternion();
  private readonly mixerSpineQuat = new THREE.Quaternion();
  /** VRM lookAt 的眼睛目标（独立对象，不参与取景包围盒） */
  private readonly gazeTarget = new THREE.Object3D();
  private readonly headWorld = new THREE.Vector3();

  private breathePhase = 0;

  constructor(vrm: VRM, normBones: Map<string, NormalizedBoneRef>) {
    this.vrm = vrm;
    this.normBones = normBones;
    // 捕获 fitVrmToCamera 之后的基础 scale，squash 在其之上叠加
    this.baseSceneScale = vrm.scene.scale.clone();
    this.lastGazeAt = performance.now();
    const head = normBones.get('head');
    if (head) this.mixerHeadQuat.copy(head.baseQuat);
    const spine = normBones.get('spine');
    if (spine) this.mixerSpineQuat.copy(spine.baseQuat);
    if (vrm.lookAt) vrm.lookAt.target = this.gazeTarget;
  }

  /**
   * fitVrmToCamera 后重新捕获基础变换（squash / 呼吸叠加的基准）。
   * 必须同时记录 position.y——否则 applyBodyIdle 每帧写 position.y 会覆盖
   * fitVrm 在归一化阶段设置的「底部对齐」偏移，导致模型整体下沉出视锥。
   */
  captureBase(): void {
    this.baseSceneScale.copy(this.vrm.scene.scale);
    this.baseSceneY = this.vrm.scene.position.y;
  }

  /** 触摸弹性反馈（scale sin 包络） */
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

  /** mixer.update 之前：叠加骨骼回到绑定姿态，避免未驱动轨道残留上一帧视线 */
  resetOverlayBones(): void {
    const head = this.normBones.get('head');
    if (head) head.node.quaternion.copy(head.baseQuat);
    const spine = this.normBones.get('spine');
    if (spine) spine.node.quaternion.copy(spine.baseQuat);
  }

  /** mixer.update 之后：快照本帧骨骼姿态，视线在其上合成 */
  captureMixerPose(): void {
    const head = this.normBones.get('head');
    if (head) this.mixerHeadQuat.copy(head.node.quaternion);
    const spine = this.normBones.get('spine');
    if (spine) this.mixerSpineQuat.copy(spine.node.quaternion);
  }

  /** 点击头部微倾（程序化回退分支用） */
  nudgeHead(): void {
    this.headYawOffset = (Math.random() - 0.5) * 0.15;
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
    const weight = this.sleeping ? 0 : gazeWeight;
    const target = gazeAngles(idle ? 0 : this.gazeNx, idle ? 0 : this.gazeNy, weight);
    if (this.sleeping) target.headPitch += HEAD_IDLE_PITCH;
    this.headYaw = smoothDamp(this.headYaw, target.headYaw, GAZE_SMOOTH.head, dt);
    this.headPitch = smoothDamp(this.headPitch, target.headPitch, GAZE_SMOOTH.head, dt);
    this.spineYaw = smoothDamp(this.spineYaw, target.spineYaw, GAZE_SMOOTH.spine, dt);
    this.applySpineTilt(procedural);
    this.applyEyeTarget(headRef);
    if (procedural) {
      this.applyProgrammaticPose(t, headRef);
    } else {
      this.applyGazeOnly(headRef);
    }
    this.decayHeadOffset();
  }

  /**
   * v3.0 P1：默认待机手臂放松（A-pose → 自然下垂）。
   * 只在待机时调用；weight 1 = 完全下垂，0 = 保持动作；t 驱动手臂微摆。
   */
  relaxArms(weight: number, t: number): void {
    if (weight <= 0) return;
    const upperL = this.normBones.get('leftUpperArm');
    const lowerL = this.normBones.get('leftLowerArm');
    const handL = this.normBones.get('leftHand');
    if (upperL && lowerL && handL) {
      relaxArm(upperL.node, lowerL.node, handL.node, 'left', weight, weight * 0.8, t);
    }
    const upperR = this.normBones.get('rightUpperArm');
    const lowerR = this.normBones.get('rightLowerArm');
    const handR = this.normBones.get('rightHand');
    if (upperR && lowerR && handR) {
      relaxArm(upperR.node, lowerR.node, handR.node, 'right', weight, weight * 0.8, t);
    }
  }

  /** 交互三段式微倾叠加（每帧 Step 4 后半，角度由状态机给出） */
  applyInteractionAngles(extraYaw: number, extraPitch: number): void {
    if (extraYaw === 0 && extraPitch === 0) return;
    const headRef = this.normBones.get('head');
    if (!headRef) return;
    const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), extraYaw);
    const pitchQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), extraPitch);
    headRef.node.quaternion.premultiply(pitchQ).premultiply(yawQ);
  }

  /**
   * 呼吸浮动 + 身体微摆（每帧 Step 5）。
   * @param breatheDeep 交互 loop 阶段加深呼吸（VPpet B_Loop 身体反应）
   * @param procedural 无 clip 时叠身体微摆（有动画时由动画本体提供微动，避免叠成双份）
   */
  applyBodyIdle(t: number, dt: number, breatheDeep: boolean, procedural: boolean): void {
    const speed = this.sleeping ? 0.5 : 1;
    this.breathePhase += dt * speed;
    const breatheAmp = this.sleeping ? 0.006 : breatheDeep ? 0.022 : 0.012;
    this.vrm.scene.position.y = this.baseSceneY + Math.sin(this.breathePhase * 1.2) * breatheAmp;
    if (procedural && !this.sleeping) {
      this.vrm.scene.rotation.y = Math.sin(t * 0.25) * 0.015;
    }
  }

  /**
   * 无动作池 clip 时：每帧叠头部 wiggle + gaze + clickFeedback。
   * 不改身体骨骼——尊重模型 GLTF 里的原始姿态，
   * 避免对某些模型过度修正导致手臂张开 → box 变宽 → fitVrm scale 不准。
   */
  private applyProgrammaticPose(t: number, headRef: NormalizedBoneRef): void {
    const wiggleYaw = Math.sin(t * 0.5) * 0.06;
    const wigglePitch = Math.sin(t * 0.7) * 0.04;
    const yawQ = new THREE.Quaternion().setFromAxisAngle(
      UP,
      wiggleYaw + this.headYaw + this.headYawOffset,
    );
    const pitchQ = new THREE.Quaternion().setFromAxisAngle(PITCH_AXIS, wigglePitch + this.headPitch);
    // 叠加在当前姿态之上（premultiply 保持与 idle clip 路径一致的叠加语义）
    headRef.node.quaternion.copy(headRef.baseQuat).premultiply(pitchQ).premultiply(yawQ);
  }

  /** 有动作 clip 时：只叠 gaze + clickFeedback（不破坏 mixer 轨道） */
  private applyGazeOnly(headRef: NormalizedBoneRef): void {
    if (this.headYaw === 0 && this.headPitch === 0 && this.headYawOffset === 0) return;
    // 以 mixer 本帧写出的姿态为基准，避免视线在骨骼上逐帧累积
    const yawQ = new THREE.Quaternion().setFromAxisAngle(
      UP,
      this.headYaw + this.headYawOffset,
    );
    const pitchQ = new THREE.Quaternion().setFromAxisAngle(PITCH_AXIS, this.headPitch);
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
