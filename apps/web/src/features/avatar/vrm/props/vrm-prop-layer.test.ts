import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { VRM } from '@pixiv/three-vrm';
import { VrmPropLayer, type PropAssetLoader } from './vrm-prop-layer';

/** 最小 VRM 桩：scene 同时作为舞台根节点 */
function makeVrm(): { vrm: VRM; hand: THREE.Object3D; stage: THREE.Object3D } {
  const scene = new THREE.Object3D();
  const hand = new THREE.Object3D();
  hand.position.set(-0.2, 0.8, 0);
  const middle = new THREE.Object3D();
  middle.position.set(0, -0.08, 0.02);
  hand.add(middle);
  scene.add(hand);
  const humanoid = {
    update: () => {},
    getNormalizedBoneNode: () => null,
    getRawBoneNode: (name: string) =>
      name === 'rightHand' ? hand : name === 'rightMiddleProximal' ? middle : null,
  };
  return { vrm: { scene, humanoid } as unknown as VRM, hand, stage: scene };
}

function stubLoader(): { loader: PropAssetLoader; created: THREE.Object3D[] } {
  const created: THREE.Object3D[] = [];
  return {
    created,
    loader: {
      load: async () => {
        const object = new THREE.Group();
        object.name = 'wbfm-prop';
        created.push(object);
        return object;
      },
    },
  };
}

/** 可控的加载闸门：先让 attach 停在 pending，再放行 */
function deferred(): {
  promise: Promise<THREE.Object3D>;
  resolve: (value: THREE.Object3D) => void;
} {
  let resolve!: (value: THREE.Object3D) => void;
  const promise = new Promise<THREE.Object3D>((done) => (resolve = done));
  return { promise, resolve };
}

describe('VrmPropLayer（S2 GLB 道具）', () => {
  it('按 manifest 加载并挂到 rightHand raw bone', async () => {
    const { vrm, hand, stage } = makeVrm();
    const { loader, created } = stubLoader();
    const layer = new VrmPropLayer(vrm, stage, undefined, loader);

    await expect(layer.attach('teacup')).resolves.toBe(true);
    await expect(layer.attach('teacup')).resolves.toBe(true); // 幂等
    expect(created).toHaveLength(1);
    expect(hand.children).toContain(created[0]);
    expect(layer.hold).toEqual({ hand: 'right', pose: 'pose.prop-hold' });
    expect(layer.debug.ids).toEqual(['teacup']);
  });

  it('加载期间立刻进入持物姿态，完成后从 pending 转 attached', async () => {
    const { vrm, stage } = makeVrm();
    const object = new THREE.Group();
    const gate = deferred();
    const layer = new VrmPropLayer(vrm, stage, undefined, { load: () => gate.promise });

    const pending = layer.attach('teacup');
    expect(layer.hold).toEqual({ hand: 'right', pose: 'pose.prop-hold' });
    expect(layer.debug.pending).toEqual(['teacup']);

    gate.resolve(object);
    await expect(pending).resolves.toBe(true);
    expect(layer.debug.pending).toEqual([]);
    expect(layer.debug.ids).toEqual(['teacup']);
  });

  it('detach 移除并释放，允许再次挂载', async () => {
    const { vrm, hand, stage } = makeVrm();
    const { loader } = stubLoader();
    const layer = new VrmPropLayer(vrm, stage, undefined, loader);
    await layer.attach('teacup');

    expect(layer.detach('teacup')).toBe(true);
    expect(hand.children.some((child) => child.name === 'wbfm-prop')).toBe(false);
    expect(layer.hold).toBeNull();
    expect(layer.detach('teacup')).toBe(false);
  });

  it('加载未完成时 detach 会取消挂载', async () => {
    const { vrm, hand, stage } = makeVrm();
    const object = new THREE.Group();
    object.name = 'wbfm-prop';
    const gate = deferred();
    const layer = new VrmPropLayer(vrm, stage, undefined, { load: () => gate.promise });

    const pending = layer.attach('teacup');
    expect(layer.detach('teacup')).toBe(true);
    gate.resolve(object);
    await expect(pending).resolves.toBe(false);
    expect(hand.children).not.toContain(object);
    expect(layer.hold).toBeNull();
  });

  it('未登记 id 拒绝，dispose 清空全部挂载', async () => {
    const { vrm, hand, stage } = makeVrm();
    const { loader } = stubLoader();
    const layer = new VrmPropLayer(vrm, stage, undefined, loader);
    await expect(layer.attach('unknown')).resolves.toBe(false);

    await layer.attach('book');
    layer.dispose();
    expect(hand.children.some((child) => child.name === 'wbfm-prop')).toBe(false);
    expect(layer.hold).toBeNull();
  });

  it('stage 道具挂场景根节点，hide 后复用同一对象', async () => {
    const { vrm, stage } = makeVrm();
    const { loader, created } = stubLoader();
    const layer = new VrmPropLayer(vrm, stage, undefined, loader);

    await expect(layer.show('table')).resolves.toBe(true);
    const object = created[0];
    expect(stage.children).toContain(object);
    expect((object as THREE.Object3D).position.x).toBeCloseTo(0.28);
    expect(layer.hold).toBeNull();

    expect(layer.hide('table')).toBe(true);
    expect(stage.children).not.toContain(object);
    await expect(layer.show('table')).resolves.toBe(true);
    expect(created).toHaveLength(1);
    expect(stage.children).toContain(object);
  });

  it('hand/stage 动作错配被拒绝', async () => {
    const { vrm, stage } = makeVrm();
    const { loader } = stubLoader();
    const layer = new VrmPropLayer(vrm, stage, undefined, loader);
    await expect(layer.show('teacup')).resolves.toBe(false);
    await expect(layer.attach('table')).resolves.toBe(false);
  });

  it('S5：pour 倾倒茶杯，flip 打开书封', async () => {
    const { vrm, stage, hand } = makeVrm();
    const cup = new THREE.Group();
    const layer = new VrmPropLayer(vrm, stage, undefined, { load: async () => cup });
    await layer.attach('teacup');
    const base = cup.quaternion.clone();
    layer.update(2400);
    expect(cup.quaternion.angleTo(base)).toBeGreaterThan(0.3);
    expect(hand.children).toContain(cup);

    const book = new THREE.Group();
    const cover = new THREE.Object3D();
    cover.name = 'book-cover';
    book.add(cover);
    const flipLayer = new VrmPropLayer(vrm, stage, undefined, { load: async () => book });
    await flipLayer.attach('book');
    flipLayer.update(1680);
    expect(cover.rotation.y).toBeLessThan(-0.5);
  });
});
