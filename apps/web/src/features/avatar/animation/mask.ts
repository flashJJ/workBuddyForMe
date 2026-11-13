/**
 * M0c 动效分层库 T1.1：骨骼组掩码。
 *
 * 从 pose/bones.ts 迁入 NORM_BONE_NAMES（旧入口保留兼容 re-export）；
 * root / face 为场景级与表情级组，不映射 normalized bone，由 adapter 处理。
 */

import type { BoneGroup, BoneMask } from './contracts';

/** 身体骨骼：Composer/行为只写这些，golden 按此采样 */
export const BODY_BONE_NAMES = [
  'spine', 'neck',
  'leftShoulder', 'rightShoulder', 'leftUpperArm', 'rightUpperArm',
  'leftLowerArm', 'rightLowerArm', 'leftHand', 'rightHand', 'head',
  'leftUpperLeg', 'rightUpperLeg', 'leftLowerLeg', 'rightLowerLeg', 'leftFoot', 'rightFoot',
] as const;

const LEFT_FINGERS = [
  'leftThumbMetacarpal', 'leftThumbProximal', 'leftThumbDistal',
  'leftIndexProximal', 'leftIndexIntermediate', 'leftIndexDistal',
  'leftMiddleProximal', 'leftMiddleIntermediate', 'leftMiddleDistal',
  'leftRingProximal', 'leftRingIntermediate', 'leftRingDistal',
  'leftLittleProximal', 'leftLittleIntermediate', 'leftLittleDistal',
] as const;

const RIGHT_FINGERS = [
  'rightThumbMetacarpal', 'rightThumbProximal', 'rightThumbDistal',
  'rightIndexProximal', 'rightIndexIntermediate', 'rightIndexDistal',
  'rightMiddleProximal', 'rightMiddleIntermediate', 'rightMiddleDistal',
  'rightRingProximal', 'rightRingIntermediate', 'rightRingDistal',
  'rightLittleProximal', 'rightLittleIntermediate', 'rightLittleDistal',
] as const;

/** 手指骨骼：自然垂手需要逐节微屈，不能像站军姿一样笔直 */
export const FINGER_BONE_NAMES = [...LEFT_FINGERS, ...RIGHT_FINGERS] as const;

/** VrmController 构造时捕获的 normalized bone 名单（姿态叠加/被拎起/自然垂手共用） */
export const NORM_BONE_NAMES = [...BODY_BONE_NAMES, ...FINGER_BONE_NAMES] as const;

export const BONE_GROUP_MEMBERS: Readonly<Record<BoneGroup, readonly string[]>> = {
  root: [],
  spine: ['spine', 'neck'],
  head: ['head'],
  leftArm: [
    'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand',
    ...LEFT_FINGERS,
  ],
  rightArm: [
    'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand',
    ...RIGHT_FINGERS,
  ],
  leftLeg: ['leftUpperLeg', 'leftLowerLeg', 'leftFoot'],
  rightLeg: ['rightUpperLeg', 'rightLowerLeg', 'rightFoot'],
  face: [],
};

const GROUP_OF_BONE = new Map<string, BoneGroup>();
for (const group of Object.keys(BONE_GROUP_MEMBERS) as BoneGroup[]) {
  for (const bone of BONE_GROUP_MEMBERS[group]) GROUP_OF_BONE.set(bone, group);
}

export function groupOfBone(bone: string): BoneGroup | undefined {
  return GROUP_OF_BONE.get(bone);
}

/** mask → 归一化骨骼名（按组声明顺序去重；exclude 后置生效） */
export function resolveMask(mask: BoneMask): string[] {
  const excluded = new Set(mask.exclude ?? []);
  const seen = new Set<string>();
  const bones: string[] = [];
  for (const group of mask.include) {
    if (excluded.has(group)) continue;
    for (const bone of BONE_GROUP_MEMBERS[group]) {
      if (seen.has(bone)) continue;
      seen.add(bone);
      bones.push(bone);
    }
  }
  return bones;
}

export function maskIncludes(mask: BoneMask, group: BoneGroup): boolean {
  return mask.include.includes(group) && !(mask.exclude ?? []).includes(group);
}

/** 单骨骼是否在 mask 内（未归属任何组的骨骼视为不可见） */
export function isBoneInMask(mask: BoneMask, bone: string): boolean {
  const group = GROUP_OF_BONE.get(bone);
  return group ? maskIncludes(mask, group) : false;
}
