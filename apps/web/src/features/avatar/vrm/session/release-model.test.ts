import { describe, expect, it, vi } from 'vitest';
import type { Object3D } from 'three';
import { releaseVrmModel, type ReleaseTarget } from './release-model';

function makeTarget(order: string[]): ReleaseTarget {
  return {
    controller: { dispose: () => order.push('controller') },
    vrm: { scene: { name: 'vrm-scene' } as unknown as Object3D },
    probe: { id: 1 },
    scene: { remove: () => order.push('remove') },
    hooks: {
      removeProbe: () => order.push('probe'),
      deepDispose: () => order.push('deepDispose'),
    },
  };
}

describe('releaseVrmModel', () => {
  it('按固定顺序释放：controller → probe → 摘场景 → deepDispose', () => {
    const order: string[] = [];
    releaseVrmModel(makeTarget(order));
    expect(order).toEqual(['controller', 'probe', 'remove', 'deepDispose']);
  });

  it('同一目标重复释放不再触发任何回调', () => {
    const order: string[] = [];
    const target = makeTarget(order);
    releaseVrmModel(target);
    releaseVrmModel(target);
    expect(order).toEqual(['controller', 'probe', 'remove', 'deepDispose']);
  });

  it('空模型（加载失败/已释放）安全跳过', () => {
    const order: string[] = [];
    releaseVrmModel(null);
    releaseVrmModel({
      controller: null,
      vrm: null,
      probe: null,
      scene: { remove: () => order.push('remove') },
      hooks: { removeProbe: () => order.push('probe'), deepDispose: () => order.push('deepDispose') },
    });
    expect(order).toEqual(['probe']);
  });

  it('控制器 dispose 抛错时仍继续释放场景资源', () => {
    const remove = vi.fn();
    const deepDispose = vi.fn();
    const removeProbe = vi.fn();
    expect(() =>
      releaseVrmModel({
        controller: { dispose: () => { throw new Error('boom'); } },
        vrm: { scene: {} as Object3D },
        probe: null,
        scene: { remove },
        hooks: { removeProbe, deepDispose },
      }),
    ).not.toThrow();
    expect(removeProbe).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(deepDispose).toHaveBeenCalledTimes(1);
  });
});
