/**
 * v3.0：头部/脊柱/视线的纯函数叠加（从 VrmPoseLayer 外迁，守住 300 行门禁）。
 *
 * 只做「给定骨骼 + 基准四元数 → 写回四元数」，不持有状态、不调度。
 */

import * as THREE from 'three';
import { GAZE_LIMITS } from '../performance/gaze';
import type { NormalizedBoneRef } from './bones';

const UP = new THREE.Vector3(0, 1, 0);
const PITCH_AXIS = new THREE.Vector3(1, 0, 0);
/** 待机颈部下压：抵消多数模型默认后仰 */
const NECK_IDLE_PITCH = 0.26;

/** 颈部下压；pitchSign 标定 VRM0(-1)/VRM1(+1) */
export function applyNeckIdlePitch(
  neck: NormalizedBoneRef,
  procedural: boolean,
  mixerQuat: THREE.Quaternion,
  pitchSign: number,
): void {
  const q = new THREE.Quaternion().setFromAxisAngle(PITCH_AXIS, NECK_IDLE_PITCH * pitchSign);
  if (procedural) neck.node.quaternion.copy(neck.baseQuat).premultiply(q);
  else neck.node.quaternion.copy(mixerQuat).premultiply(q);
}

/** 脊柱跟随视线微转 */
export function applySpineYaw(
  spine: NormalizedBoneRef,
  procedural: boolean,
  mixerQuat: THREE.Quaternion,
  yaw: number,
): void {
  const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
  if (procedural) spine.node.quaternion.copy(spine.baseQuat).premultiply(q);
  else spine.node.quaternion.copy(mixerQuat).premultiply(q);
}

/** lookAt 眼睛目标：放在头部前方，按平滑后的头部角度偏移 */
export function aimEyeTarget(
  enabled: boolean,
  head: NormalizedBoneRef,
  headYaw: number,
  headPitch: number,
  target: THREE.Object3D,
  headWorld: THREE.Vector3,
): void {
  if (!enabled) return;
  head.node.updateWorldMatrix(true, false);
  head.node.getWorldPosition(headWorld);
  const yawRatio = headYaw / (GAZE_LIMITS.headYawDeg * (Math.PI / 180));
  const pitchRatio = headPitch / (GAZE_LIMITS.headPitchDeg * (Math.PI / 180));
  target.position.set(
    headWorld.x + yawRatio * 0.6,
    headWorld.y - pitchRatio * 0.4,
    headWorld.z + 1,
  );
  target.updateMatrixWorld(true);
}
