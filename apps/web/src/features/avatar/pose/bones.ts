import * as THREE from 'three';

/** VRM normalized bone 引用（baseQuat = 绑定姿态） */
export interface NormalizedBoneRef {
  name: string;
  node: THREE.Object3D;
  baseQuat: THREE.Quaternion;
}

/** VrmController 构造时捕获的 normalized bone 名单（姿态叠加/被拎起共用） */
export const NORM_BONE_NAMES = [
  'spine', 'neck',
  'leftShoulder', 'rightShoulder', 'leftUpperArm', 'rightUpperArm',
  'leftLowerArm', 'rightLowerArm', 'leftHand', 'rightHand', 'head',
  'leftUpperLeg', 'rightUpperLeg', 'leftLowerLeg', 'rightLowerLeg', 'leftFoot', 'rightFoot',
] as const;
