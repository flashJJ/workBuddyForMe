import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { NormalizedBoneRef } from '../../../pose/bones';
import { NORM_BONE_NAMES } from '../../mask';
import { Skeleton } from '../../skeleton';
import { POSE_EXECUTORS } from '../../adapters/vrm-executors';

const FINGER_PATTERN = /(Thumb|Index|Middle|Ring|Little)/;

function makeHand(side: 'left' | 'right'): Map<string, NormalizedBoneRef> {
  const bones = new Map<string, NormalizedBoneRef>();
  for (const name of NORM_BONE_NAMES) {
    if (!name.startsWith(side) || !FINGER_PATTERN.test(name)) continue;
    const node = new THREE.Object3D();
    bones.set(name, { name, node, baseQuat: node.quaternion.clone() });
  }
  return bones;
}

function angleOf(bones: Map<string, NormalizedBoneRef>, name: string): number {
  const ref = bones.get(name);
  return ref ? new THREE.Quaternion().angleTo(ref.node.quaternion) : Number.NaN;
}

function runHandPose(
  executor: keyof typeof POSE_EXECUTORS,
  bones: Map<string, NormalizedBoneRef>,
  weight: number,
): void {
  POSE_EXECUTORS[executor]?.(new Skeleton([]), bones, weight, 0);
}

describe('自然垂手手指微屈（T2.5 前置）', () => {
  it('垂臂时五指逐节弯曲，且左右符号相反', () => {
    const left = makeHand('left');
    runHandPose('pose.arms-hang', left, 1);
    expect(angleOf(left, 'leftIndexProximal')).toBeCloseTo(0.24, 3);
    expect(angleOf(left, 'leftIndexIntermediate')).toBeCloseTo(0.42, 3);
    expect(angleOf(left, 'leftThumbMetacarpal')).toBeCloseTo(0.14, 3);
    expect(left.get('leftIndexProximal')?.node.quaternion.z).toBeGreaterThan(0);

    const right = makeHand('right');
    runHandPose('pose.arms-hang', right, 1);
    expect(right.get('rightIndexProximal')?.node.quaternion.z).toBeLessThan(0);
  });

  it('重复调用不累加', () => {
    const full = makeHand('left');
    runHandPose('pose.arms-hang', full, 1);
    runHandPose('pose.arms-hang', full, 1);
    expect(angleOf(full, 'leftMiddleIntermediate')).toBeCloseTo(0.46, 3);
  });
});
