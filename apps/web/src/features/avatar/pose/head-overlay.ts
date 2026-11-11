/**
 * v3.0：头部/脊柱/视线的纯函数叠加（从 VrmPoseLayer 外迁，守住 300 行门禁）。
 *
 * 只做「给定骨骼 + 基准四元数 → 写回四元数」，不持有状态、不调度。
 */

import * as THREE from 'three';
import { GAZE_LIMITS } from '../performance/gaze';
import type { GestureAngles } from '../performance/gesture';
import type { NormalizedBoneRef } from './bones';

const UP = new THREE.Vector3(0, 1, 0);
const PITCH_AXIS = new THREE.Vector3(1, 0, 0);
/** 待机颈部下压：抵消多数模型默认后仰 */
const NECK_IDLE_PITCH = 0.26;

/** 颈部下压；pitchSign 标定 VRM0(-1)/VRM1(+1)，叠加在当前姿态上 */
export function applyNeckIdlePitch(neck: NormalizedBoneRef, pitchSign: number): void {
  const q = new THREE.Quaternion().setFromAxisAngle(PITCH_AXIS, NECK_IDLE_PITCH * pitchSign);
  neck.node.quaternion.premultiply(q);
}

/** 脊柱跟随视线微转，叠加在当前姿态上（含行为姿势） */
export function applySpineYaw(spine: NormalizedBoneRef, yaw: number): void {
  const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
  spine.node.quaternion.premultiply(q);
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

/** 无动作 clip：wiggle + gaze + 手势，叠加在当前姿态上（含行为姿势） */
export function applyProceduralHead(
  head: NormalizedBoneRef,
  t: number,
  headYaw: number,
  headPitch: number,
  yawOffset: number,
  gesture: GestureAngles,
  pitchSign: number,
): void {
  const yawQ = new THREE.Quaternion().setFromAxisAngle(
    UP,
    Math.sin(t * 0.5) * 0.06 + headYaw + yawOffset + gesture.yaw,
  );
  const pitchQ = new THREE.Quaternion().setFromAxisAngle(
    PITCH_AXIS,
    Math.sin(t * 0.7) * 0.04 + headPitch + gesture.pitch * pitchSign,
  );
  head.node.quaternion.premultiply(pitchQ).premultiply(yawQ);
}

/** 有动作 clip：只叠 gaze + 点击微倾 + 手势，叠加在当前姿态上 */
export function applyClipHead(
  head: NormalizedBoneRef,
  headYaw: number,
  headPitch: number,
  yawOffset: number,
  gesture: GestureAngles,
  pitchSign: number,
): void {
  const yaw = headYaw + yawOffset + gesture.yaw;
  if (yaw === 0 && headPitch === 0 && gesture.pitch === 0) return;
  const yawQ = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
  const pitchQ = new THREE.Quaternion().setFromAxisAngle(PITCH_AXIS, headPitch + gesture.pitch * pitchSign);
  head.node.quaternion.premultiply(pitchQ).premultiply(yawQ);
}

/** 三段式交互微倾：先俯仰后水平（保持旧实现的叠加顺序） */
export function applyHeadInteraction(
  head: NormalizedBoneRef,
  extraYaw: number,
  extraPitch: number,
): void {
  if (extraYaw === 0 && extraPitch === 0) return;
  const yawQ = new THREE.Quaternion().setFromAxisAngle(UP, extraYaw);
  const pitchQ = new THREE.Quaternion().setFromAxisAngle(PITCH_AXIS, extraPitch);
  head.node.quaternion.premultiply(pitchQ).premultiply(yawQ);
}
