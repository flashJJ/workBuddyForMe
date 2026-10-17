import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import {
  TOUCH_SQUASH_MS,
  TOUCH_SQUASH_SCALE_X,
  TOUCH_SQUASH_SCALE_Y,
} from '@wbfm/shared/constants';

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

  private gazeYaw = 0;
  private gazePitch = 0;
  private headYawOffset = 0; // 点击头部微倾

  private breathePhase = 0;

  constructor(vrm: VRM, normBones: Map<string, NormalizedBoneRef>) {
    this.vrm = vrm;
    this.normBones = normBones;
    // 捕获 fitVrmToCamera 之后的基础 scale，squash 在其之上叠加
    this.baseSceneScale = vrm.scene.scale.clone();
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
    // nx/ny 归一化 -1..1 → 角度制 yaw/pitch（弧度）
    this.gazeYaw = nx * 0.2;
    this.gazePitch = -ny * 0.15;
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

  /** 头部叠加层（每帧 Step 4 前半）：无 clip 时叠 wiggle，有 clip 时只叠 gaze/click */
  applyHeadOverlay(t: number, procedural: boolean): void {
    const headRef = this.normBones.get('head');
    if (!headRef) return;
    if (procedural) {
      this.applyProgrammaticPose(t, headRef);
    } else {
      this.applyGazeOnly(headRef);
    }
    this.decayHeadOffset();
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
    this.breathePhase += dt;
    const breatheAmp = breatheDeep ? 0.022 : 0.012;
    this.vrm.scene.position.y = this.baseSceneY + Math.sin(this.breathePhase * 1.2) * breatheAmp;
    if (procedural) {
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
      new THREE.Vector3(0, 1, 0),
      wiggleYaw + this.gazeYaw + this.headYawOffset,
    );
    const pitchQ = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      wigglePitch + this.gazePitch,
    );
    // 叠加在当前姿态之上（premultiply 保持与 idle clip 路径一致的叠加语义）
    headRef.node.quaternion.copy(headRef.baseQuat).premultiply(pitchQ).premultiply(yawQ);
  }

  /** 有动作 clip 时：只叠 gaze + clickFeedback（不破坏 mixer 轨道） */
  private applyGazeOnly(headRef: NormalizedBoneRef): void {
    if (this.gazeYaw === 0 && this.gazePitch === 0 && this.headYawOffset === 0) return;
    // premultiply 在当前 mixer 已设的 quaternion 上叠加
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

  /** 点击微倾指数衰减（两条叠加路径共用） */
  private decayHeadOffset(): void {
    this.headYawOffset *= 0.85;
    if (Math.abs(this.headYawOffset) < 0.003) this.headYawOffset = 0;
  }
}
