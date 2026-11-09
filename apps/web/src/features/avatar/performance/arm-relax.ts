import * as THREE from 'three';

/**
 * v3.0 P1：默认待机手臂放松。
 *
 * 内置 daiji.vrma 与多数 VRM 素体的手臂是 A-pose（上臂外展、手掌悬在身体两侧），
 * 直接播放会显得「手不是垂直放下」。这里不修改动作资产，而是在 mixer 之后按
 * 「骨骼 → 子骨骼」的真实世界方向，把上臂/前臂朝下目标旋转一部分：
 * - 世界空间求方向，不依赖骨骼命名与局部轴；
 * - weight 控制覆盖幅度（1=完全下垂，0=保持动作原样）；
 * - 交互手势/长按期间不调用，避免把举手动作掰下来。
 */

const UPPER_TARGET = {
  left: new THREE.Vector3(0.16, -1, 0.04),
  right: new THREE.Vector3(-0.16, -1, 0.04),
} as const;
const LOWER_TARGET = {
  left: new THREE.Vector3(0.06, -1, 0.12),
  right: new THREE.Vector3(-0.06, -1, 0.12),
} as const;

/** 待机微摆幅度：目标方向上的小幅偏移，让放下的手仍有呼吸感 */
const UPPER_SWAY = { x: 0.035, z: 0.05 } as const;
const LOWER_SWAY = { x: 0.045, z: 0.06 } as const;

const bonePos = new THREE.Vector3();
const childPos = new THREE.Vector3();
const currentDir = new THREE.Vector3();
const targetDir = new THREE.Vector3();
const delta = new THREE.Quaternion();
const partial = new THREE.Quaternion();
const boneWorld = new THREE.Quaternion();
const parentWorld = new THREE.Quaternion();
const targetWorld = new THREE.Quaternion();
const swayTarget = new THREE.Vector3();

/** 把 bone→child 的世界方向朝 target 旋转 weight（0..1） */
export function aimBone(
  bone: THREE.Object3D,
  child: THREE.Object3D,
  target: THREE.Vector3,
  weight: number,
): void {
  const parent = bone.parent;
  if (!parent || weight <= 0) return;
  bone.updateWorldMatrix(true, false);
  child.updateWorldMatrix(true, false);
  bone.getWorldPosition(bonePos);
  child.getWorldPosition(childPos);
  currentDir.copy(childPos).sub(bonePos);
  if (currentDir.lengthSq() < 1e-8) return;
  currentDir.normalize();
  targetDir.copy(target).normalize();

  delta.setFromUnitVectors(currentDir, targetDir);
  // 取最短路径，避免部分模型上出现 180° 翻转
  if (delta.w < 0) delta.set(-delta.x, -delta.y, -delta.z, -delta.w);
  partial.identity().slerp(delta, Math.min(1, weight));

  bone.getWorldQuaternion(boneWorld);
  parent.getWorldQuaternion(parentWorld);
  targetWorld.copy(partial).multiply(boneWorld);
  bone.quaternion.copy(parentWorld.invert().multiply(targetWorld));
  bone.updateWorldMatrix(false, true);
}

/** 左右手臂放松：上臂先下垂，再处理前臂（依赖上臂已更新）；t 驱动小幅自然摆动 */
export function relaxArm(
  upper: THREE.Object3D,
  lower: THREE.Object3D,
  hand: THREE.Object3D,
  side: 'left' | 'right',
  upperWeight: number,
  lowerWeight: number,
  t = 0,
): void {
  const phase = side === 'left' ? 0 : Math.PI * 0.85;
  const swayX = Math.sin(t * 0.9 + phase);
  const swayZ = Math.cos(t * 0.65 + phase);

  const upperTarget = swayTarget
    .copy(UPPER_TARGET[side])
    .setX(UPPER_TARGET[side].x + swayX * UPPER_SWAY.x)
    .setZ(UPPER_TARGET[side].z + swayZ * UPPER_SWAY.z);
  aimBone(upper, lower, upperTarget, upperWeight);

  const lowerTarget = swayTarget
    .copy(LOWER_TARGET[side])
    .setX(LOWER_TARGET[side].x + swayX * LOWER_SWAY.x)
    .setZ(LOWER_TARGET[side].z + swayZ * LOWER_SWAY.z);
  aimBone(lower, hand, lowerTarget, lowerWeight);
}
