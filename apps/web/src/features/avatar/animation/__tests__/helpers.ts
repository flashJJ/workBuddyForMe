import { expect } from 'vitest';
import type { BoneQuat } from '../contracts';
import { copyQuat } from '../math';
import { Skeleton, type SkeletonBone } from '../skeleton';

/** 测试用内存骨架：每根骨骼一个可读写的四元数 */
export function createSkeleton(names: readonly string[]): {
  store: Map<string, BoneQuat>;
  skeleton: Skeleton;
} {
  const store = new Map<string, BoneQuat>();
  const bones: SkeletonBone[] = names.map((name) => {
    const current: BoneQuat = { x: 0, y: 0, z: 0, w: 1 };
    store.set(name, current);
    return {
      name,
      read: (out) => copyQuat(out, current),
      write: (quat) => {
        copyQuat(current, quat);
      },
    };
  });
  return { store, skeleton: new Skeleton(bones) };
}

export function quat(): BoneQuat {
  return { x: 0, y: 0, z: 0, w: 1 };
}

/** 四元数逐分量比较（四元数 q 与 -q 等价，这里保持符号一致再比） */
export function expectQuatClose(actual: Readonly<BoneQuat> | undefined, expected: BoneQuat): void {
  expect(actual).toBeDefined();
  if (!actual) return;
  const sign = actual.w * expected.w < 0 ? -1 : 1;
  expect(actual.x).toBeCloseTo(expected.x * sign, 6);
  expect(actual.y).toBeCloseTo(expected.y * sign, 6);
  expect(actual.z).toBeCloseTo(expected.z * sign, 6);
  expect(actual.w).toBeCloseTo(expected.w * sign, 6);
}

/** 单位四元数对应的旋转角（弧度） */
export function quatAngle(q: Readonly<BoneQuat>): number {
  return 2 * Math.acos(Math.min(1, Math.abs(q.w)));
}
