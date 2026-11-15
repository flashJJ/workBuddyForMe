import { describe, expect, it } from 'vitest';
import type { PoseDefinition } from '../contracts';
import { copyQuat, quatFromEuler } from '../math';
import { applyPose } from '../pose';
import { createSkeleton, expectQuatClose, quat, quatAngle } from './helpers';

const HALF_PI = Math.PI / 2;

function spinePose(rotY: number, additive?: boolean): PoseDefinition {
  return {
    id: 'test.spine',
    mask: { include: ['spine'] },
    bones: { spine: { y: rotY } },
    additive,
  };
}

describe('applyPose', () => {
  it('override 用绑定姿态 + 偏移替换当前姿态', () => {
    const { store, skeleton } = createSkeleton(['spine']);
    skeleton.capture();
    // 帧快照记录 mixer 姿态，override 应忽略它
    copyQuat(store.get('spine') ?? quat(), quatFromEuler(quat(), 0.4, 0.2, 0));
    skeleton.captureFrame();
    const written = applyPose(skeleton, spinePose(HALF_PI, false));
    expect(written).toBe(1);
    expectQuatClose(store.get('spine'), quatFromEuler(quat(), 0, HALF_PI, 0));
  });

  it('additive 默认叠加在当前姿态上', () => {
    const { store, skeleton } = createSkeleton(['spine']);
    copyQuat(store.get('spine') ?? quat(), quatFromEuler(quat(), 0, HALF_PI / 2, 0));
    skeleton.captureFrame();
    applyPose(skeleton, spinePose(HALF_PI / 2));
    expect(quatAngle(store.get('spine') ?? quat())).toBeCloseTo(HALF_PI, 6);
  });

  it('weight 0.5 只走一半角度', () => {
    const { store, skeleton } = createSkeleton(['spine']);
    skeleton.captureFrame();
    applyPose(skeleton, spinePose(HALF_PI, false), { weight: 0.5 });
    expect(quatAngle(store.get('spine') ?? quat())).toBeCloseTo(HALF_PI / 2, 6);
  });

  it('weight 0 不写骨骼', () => {
    const { store, skeleton } = createSkeleton(['spine']);
    const written = applyPose(skeleton, spinePose(HALF_PI), { weight: 0 });
    expect(written).toBe(0);
    expect(store.get('spine')).toEqual(quat());
  });

  it('姿势 mask 与轨道 mask 取交集', () => {
    const { store, skeleton } = createSkeleton(['head', 'spine']);
    const pose: PoseDefinition = {
      id: 'test.upper',
      mask: { include: ['head', 'spine'] },
      bones: { head: { y: 0.3 }, spine: { y: 0.3 } },
    };
    const written = applyPose(skeleton, pose, { mask: { include: ['head'] } });
    expect(written).toBe(1);
    expectQuatClose(store.get('head'), quatFromEuler(quat(), 0, 0.3, 0));
    expect(store.get('spine')).toEqual(quat());
  });

  it('mask 之外的骨骼与未知骨骼被跳过', () => {
    const { skeleton } = createSkeleton(['spine', 'head']);
    const pose: PoseDefinition = {
      id: 'test.mismatch',
      mask: { include: ['spine'] },
      bones: { head: { y: 0.3 }, hips: { y: 0.3 } },
    };
    expect(applyPose(skeleton, pose)).toBe(0);
  });
});
