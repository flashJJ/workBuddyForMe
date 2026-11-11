import * as THREE from 'three';

/** VRM normalized bone 引用（baseQuat = 绑定姿态） */
export interface NormalizedBoneRef {
  name: string;
  node: THREE.Object3D;
  baseQuat: THREE.Quaternion;
}

/** 名单已迁至 animation/mask.ts（M0c T1.1），此处保留兼容 re-export */
export { NORM_BONE_NAMES } from '../animation/mask';
