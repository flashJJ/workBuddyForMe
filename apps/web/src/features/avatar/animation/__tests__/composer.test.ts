import { describe, expect, it } from 'vitest';
import { Composer } from '../composer';
import type { PoseDefinition } from '../contracts';
import { quatFromEuler, quatMultiply } from '../math';
import { PoseLibrary } from '../pose';
import { createSkeleton, expectQuatClose, quat } from './helpers';

const HALF_PI = Math.PI / 2;

function pose(id: string, bone: string, rot: { x?: number; y?: number; z?: number }): PoseDefinition {
  return { id, mask: { include: ['spine'] }, bones: { [bone]: rot } };
}

describe('Composer', () => {
  it('多个 additive 姿势按顺序叠加', () => {
    const { store, skeleton } = createSkeleton(['spine']);
    skeleton.captureFrame();
    const library = new PoseLibrary([
      pose('a', 'spine', { y: HALF_PI }),
      pose('b', 'spine', { x: HALF_PI }),
    ]);
    const composer = new Composer(skeleton, library);
    const written = composer.compose([
      { pose: 'a', priority: 3 },
      { pose: 'b', priority: 0 },
    ]);
    expect(written).toBe(2);
    const a = quatFromEuler(quat(), 0, HALF_PI, 0);
    const expected = quatMultiply(quat(), quatFromEuler(quat(), HALF_PI, 0, 0), a);
    expectQuatClose(store.get('spine'), expected);
  });

  it('低数值优先级后写，覆盖高数值层', () => {
    const { store, skeleton } = createSkeleton(['spine']);
    skeleton.capture();
    skeleton.captureFrame();
    const library = new PoseLibrary([
      { ...pose('high', 'spine', { y: HALF_PI }), additive: false },
      { ...pose('low', 'spine', { x: HALF_PI }), additive: false },
    ]);
    const composer = new Composer(skeleton, library);
    composer.compose([
      { pose: 'high', priority: 3 },
      { pose: 'low', priority: 0 },
    ]);
    // override 都用帧快照计算，最后写入的低优先级层胜出
    expectQuatClose(store.get('spine'), quatFromEuler(quat(), HALF_PI, 0, 0));
  });

  it('每帧先恢复帧快照，避免叠加累积', () => {
    const { store, skeleton } = createSkeleton(['spine']);
    skeleton.captureFrame();
    const composer = new Composer(skeleton, new PoseLibrary([pose('a', 'spine', { y: HALF_PI })]));
    composer.compose([{ pose: 'a' }]);
    composer.compose([]);
    expect(store.get('spine')).toEqual(quat());
  });

  it('轨道 mask 限定写入范围', () => {
    const { store, skeleton } = createSkeleton(['head', 'spine']);
    skeleton.captureFrame();
    const library = new PoseLibrary([
      { id: 'upper', mask: { include: ['head', 'spine'] }, bones: { head: { y: 0.2 }, spine: { y: 0.2 } } },
    ]);
    const composer = new Composer(skeleton, library);
    expect(composer.compose([{ pose: 'upper', mask: { include: ['head'] } }])).toBe(1);
    expect(store.get('spine')).toEqual(quat());
  });

  it('未注册的姿势与 weight 0 不写入', () => {
    const { skeleton } = createSkeleton(['spine']);
    const composer = new Composer(skeleton, new PoseLibrary([pose('a', 'spine', { y: 0.3 })]));
    expect(composer.compose([{ pose: 'missing' }])).toBe(0);
    expect(composer.compose([{ pose: 'a', weight: 0 }])).toBe(0);
  });

  it('definition 直接参与合成（motion 采样结果）', () => {
    const { store, skeleton } = createSkeleton(['spine']);
    skeleton.captureFrame();
    const composer = new Composer(skeleton, new PoseLibrary());
    const written = composer.compose([
      {
        definition: { id: 'blend', mask: { include: ['spine'] }, bones: { spine: { y: HALF_PI } } },
      },
    ]);
    expect(written).toBe(1);
    expectQuatClose(store.get('spine'), quatFromEuler(quat(), 0, HALF_PI, 0));
  });
});
