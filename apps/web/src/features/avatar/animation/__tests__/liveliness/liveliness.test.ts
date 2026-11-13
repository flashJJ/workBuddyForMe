import { describe, expect, it } from 'vitest';
import { LivelinessLayer, supportFactor, type LivelinessParams } from '../../liveliness';
import { Skeleton, type SkeletonBone } from '../../skeleton';
import type { BoneQuat } from '../../contracts';

const NAMES = ['spine', 'chest', 'leftShoulder', 'rightShoulder', 'leftUpperArm', 'rightUpperArm'] as const;

function makeRig(): { skeleton: Skeleton; angles: () => number[] } {
  const store = new Map<string, BoneQuat>();
  const bones: SkeletonBone[] = NAMES.map((name) => ({
    name,
    read(out: BoneQuat): BoneQuat {
      const q = store.get(name) ?? { x: 0, y: 0, z: 0, w: 1 };
      out.x = q.x;
      out.y = q.y;
      out.z = q.z;
      out.w = q.w;
      return out;
    },
    write(quat: BoneQuat): void {
      store.set(name, { x: quat.x, y: quat.y, z: quat.z, w: quat.w });
    },
  }));
  const skeleton = new Skeleton(bones);
  const angles = () =>
    NAMES.map((name) => {
      const q = store.get(name);
      if (!q) return 0;
      return 2 * Math.acos(Math.min(1, Math.abs(q.w)));
    });
  return { skeleton, angles };
}

function params(patch: Partial<LivelinessParams> = {}): LivelinessParams {
  return { tension: 0, asymmetry: 0, breathMix: 0, microMotion: 0, ...patch };
}

describe('supportFactor（重心支撑校验）', () => {
  it('双脚连线附近为 1，远离为 0，中间线性过渡', () => {
    // 双脚在 x=±0.1，髋在原点 → 距离 0，完全在支撑内
    expect(supportFactor(0, 0, -0.1, 0, 0.1, 0)).toBe(1);
    // 0.25 已超出半宽 0.09，距离 0.15 → 约 0.57
    expect(supportFactor(0.25, 0, -0.1, 0, 0.1, 0)).toBeGreaterThan(0.3);
    expect(supportFactor(0.25, 0, -0.1, 0, 0.1, 0)).toBeLessThan(0.7);
    expect(supportFactor(0.5, 0, -0.1, 0, 0.1, 0)).toBe(0);
  });

  it('双脚重合时退化为点支撑，不会出现 NaN', () => {
    expect(supportFactor(0, 0, 0, 0, 0, 0)).toBe(1);
    expect(Number.isNaN(supportFactor(0.2, 0, 0, 0, 0, 0))).toBe(false);
  });
});

describe('LivelinessLayer（呼吸 / 不对称 / 微扰）', () => {
  it('呼吸会让脊柱产生小幅旋转，且不会累积漂移', () => {
    const { skeleton, angles } = makeRig();
    const layer = new LivelinessLayer();
    let max = 0;
    for (let i = 0; i < 600; i += 1) {
      layer.update(skeleton, params({ breathMix: 1 }), 1 / 60, 1);
      max = Math.max(max, ...angles());
    }
    expect(max).toBeGreaterThan(0.001);
    expect(max).toBeLessThan(0.05);
  });

  it('tension 越高幅度越小（呼吸变浅 + 微扰关闭）', () => {
    const run = (tension: number) => {
      const { skeleton, angles } = makeRig();
      const layer = new LivelinessLayer();
      let sum = 0;
      for (let i = 0; i < 240; i += 1) {
        layer.update(skeleton, params({ breathMix: 1, microMotion: 1, tension }), 1 / 60, 1);
        sum += angles().reduce((a, b) => a + b, 0);
      }
      return sum;
    };
    expect(run(1)).toBeLessThan(run(0));
  });

  it('睡眠时关闭不对称与微扰，只保留呼吸', () => {
    const run = (sleeping: boolean) => {
      const { skeleton, angles } = makeRig();
      const layer = new LivelinessLayer();
      let sum = 0;
      for (let i = 0; i < 180; i += 1) {
        layer.update(skeleton, params({ breathMix: 1, asymmetry: 1 }), 1 / 60, 1, sleeping);
        sum += angles().reduce((a, b) => a + b, 0);
      }
      return sum;
    };
    expect(run(true)).toBeLessThan(run(false));
  });

  it('重心越界时不对称被衰减', () => {
    const run = (support: number) => {
      const { skeleton, angles } = makeRig();
      const layer = new LivelinessLayer();
      let sum = 0;
      for (let i = 0; i < 180; i += 1) {
        layer.update(skeleton, params({ asymmetry: 1 }), 1 / 60, support);
        sum += angles().reduce((a, b) => a + b, 0);
      }
      return sum;
    };
    expect(run(0)).toBeLessThan(run(1));
  });
});
