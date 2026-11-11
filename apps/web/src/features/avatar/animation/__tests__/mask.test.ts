import { describe, expect, it } from 'vitest';
import {
  BONE_GROUP_MEMBERS,
  NORM_BONE_NAMES,
  groupOfBone,
  isBoneInMask,
  maskIncludes,
  resolveMask,
} from '../mask';
import type { BoneGroup } from '../contracts';

describe('骨骼名单', () => {
  it('17 根 normalized bone 不重复', () => {
    expect(NORM_BONE_NAMES).toHaveLength(17);
    expect(new Set(NORM_BONE_NAMES).size).toBe(NORM_BONE_NAMES.length);
  });

  it('每根骨骼恰好归属一个组', () => {
    for (const bone of NORM_BONE_NAMES) {
      expect(groupOfBone(bone)).toBeDefined();
    }
  });

  it('组内骨骼合起来覆盖全部名单', () => {
    const groups = Object.keys(BONE_GROUP_MEMBERS) as BoneGroup[];
    const members = groups.flatMap((group) => BONE_GROUP_MEMBERS[group]);
    expect(new Set(members)).toEqual(new Set(NORM_BONE_NAMES));
    expect(groupOfBone('unknownBone')).toBeUndefined();
  });

  it('root / face 不映射骨骼，交给 adapter', () => {
    expect(BONE_GROUP_MEMBERS.root).toEqual([]);
    expect(BONE_GROUP_MEMBERS.face).toEqual([]);
    expect(resolveMask({ include: ['root', 'face'] })).toEqual([]);
  });
});

describe('resolveMask', () => {
  it('按组声明顺序展开，重复组去重', () => {
    const bones = resolveMask({ include: ['leftArm', 'leftArm', 'head'] });
    expect(bones).toEqual([
      'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand', 'head',
    ]);
  });

  it('exclude 后置生效', () => {
    const bones = resolveMask({ include: ['leftArm', 'rightArm'], exclude: ['rightArm'] });
    expect(bones).toEqual(['leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand']);
    expect(bones).not.toContain('rightUpperArm');
  });
});

describe('掩码判定', () => {
  it('include / exclude 同时约束组与单骨骼', () => {
    const mask = { include: ['spine', 'head'] as BoneGroup[], exclude: ['head'] as BoneGroup[] };
    expect(maskIncludes(mask, 'spine')).toBe(true);
    expect(maskIncludes(mask, 'head')).toBe(false);
    expect(isBoneInMask(mask, 'neck')).toBe(true);
    expect(isBoneInMask(mask, 'head')).toBe(false);
    expect(isBoneInMask(mask, 'leftUpperArm')).toBe(false);
    expect(isBoneInMask(mask, 'hips')).toBe(false);
  });
});
