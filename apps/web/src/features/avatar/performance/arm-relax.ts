import * as THREE from 'three';

/**
 * 手臂求解的原语：只做「世界方向对齐」与「绕前臂轴滚腕」。
 *
 * 目标方向与掌心意图由 animation/arms/intents.ts 声明，求解编排由
 * animation/arms/solver.ts 统一完成；这里不保存任何动作数值。
 *
 * - 世界空间求方向，不依赖骨骼命名与局部轴；
 * - weight 控制覆盖幅度（1=完全对齐，0=保持原样）。
 */

const bonePos = new THREE.Vector3();
const childPos = new THREE.Vector3();
const currentDir = new THREE.Vector3();
const targetDir = new THREE.Vector3();
const delta = new THREE.Quaternion();
const partial = new THREE.Quaternion();
const boneWorld = new THREE.Quaternion();
const parentWorld = new THREE.Quaternion();
const targetWorld = new THREE.Quaternion();

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

/**
 * 绕前臂轴滚动手掌，让掌心朝目标方向；weight 0..1。
 *
 * 实测本家族手骨的掌心法线是局部 -Y（+Y 是手背）；
 * 不能按 T-pose 世界轴或局部 +Y 猜，否则整只手会翻转 180°。
 */
const PALM_LOCAL = new THREE.Vector3(0, -1, 0);
const palmAxis = new THREE.Vector3();
const palmNow = new THREE.Vector3();
const palmWant = new THREE.Vector3();
const palmCross = new THREE.Vector3();
const palmWorldQ = new THREE.Quaternion();
const palmParentQ = new THREE.Quaternion();
const palmRollQ = new THREE.Quaternion();

export function orientPalm(
  hand: THREE.Object3D,
  forearmDir: THREE.Vector3,
  targetNormal: THREE.Vector3,
  weight: number,
): void {
  if (weight <= 0 || forearmDir.lengthSq() < 1e-8) return;
  const axis = palmAxis.copy(forearmDir).normalize();
  hand.getWorldQuaternion(palmWorldQ);
  palmNow.copy(PALM_LOCAL).applyQuaternion(palmWorldQ).projectOnPlane(axis);
  palmWant.copy(targetNormal).projectOnPlane(axis);
  if (palmNow.lengthSq() < 1e-6 || palmWant.lengthSq() < 1e-6) return;
  palmNow.normalize();
  palmWant.normalize();
  palmCross.crossVectors(palmNow, palmWant);
  const angle = Math.atan2(palmCross.dot(axis), palmNow.dot(palmWant));
  palmRollQ.setFromAxisAngle(axis, angle * Math.min(1, weight));
  const parent = hand.parent;
  if (!parent) return;
  parent.getWorldQuaternion(palmParentQ);
  palmRollQ.multiply(palmWorldQ);
  hand.quaternion.copy(palmParentQ.invert().multiply(palmRollQ));
  hand.updateWorldMatrix(false, true);
}
