import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { describe, expect, it } from 'vitest';
import { VrmPoseLayer } from './vrm-pose-layer';

/** 只用到 scene 的最小 VRM 替身（构造函数只读 scene.scale 与 lookAt） */
function makeVrm(baseRotationY = Math.PI): { vrm: VRM; scene: THREE.Object3D } {
  const scene = new THREE.Object3D();
  scene.rotation.y = baseRotationY;
  scene.position.y = 0.5;
  return { vrm: { scene, lookAt: null } as unknown as VRM, scene };
}

describe('VrmPoseLayer.applyBodyIdle', () => {
  it('身体微摆叠加在基准朝向上，不覆盖 VRM0 的 180°（rotateVRM0）', () => {
    const { vrm, scene } = makeVrm();
    const layer = new VrmPoseLayer(vrm, new Map());
    layer.captureBase();

    layer.applyBodyIdle(1, 0.016, false, false);
    expect(Math.abs(scene.rotation.y - Math.PI)).toBeLessThanOrEqual(0.02);
    // 呼吸浮动同样以基准 position.y 为底，不是绝对值
    expect(Math.abs(scene.position.y - 0.5)).toBeLessThanOrEqual(0.03);

    layer.applyBodyIdle(2, 0.016, false, true);
    expect(Math.abs(scene.rotation.y - Math.PI)).toBeLessThanOrEqual(0.02);
  });

  it('首帧微摆后 captureBase 不会把基准朝向改写成摆动值', () => {
    const { vrm, scene } = makeVrm();
    const layer = new VrmPoseLayer(vrm, new Map());
    // 模拟「animate 先跑了一帧、fit/captureBase 后到」的真实时序
    layer.applyBodyIdle(1, 0.016, false, false);
    layer.captureBase();
    layer.applyBodyIdle(2, 0.016, false, false);
    expect(Math.abs(scene.rotation.y - Math.PI)).toBeLessThanOrEqual(0.02);
  });

  it('VRM1（基准 0）同样只做小幅摆动', () => {
    const { vrm, scene } = makeVrm(0);
    const layer = new VrmPoseLayer(vrm, new Map());
    layer.captureBase();
    layer.applyBodyIdle(3, 0.016, false, false);
    expect(Math.abs(scene.rotation.y)).toBeLessThanOrEqual(0.02);
  });

  it('睡眠时不再改写朝向', () => {
    const { vrm, scene } = makeVrm();
    const layer = new VrmPoseLayer(vrm, new Map());
    layer.captureBase();
    layer.setSleeping(true);
    layer.applyBodyIdle(4, 0.016, false, false);
    expect(scene.rotation.y).toBe(Math.PI);
  });

  it('背对转到基准 + π，转回后回到基准', () => {
    const { vrm, scene } = makeVrm();
    const layer = new VrmPoseLayer(vrm, new Map());
    layer.captureBase();

    layer.setFaceAway(true);
    for (let i = 0; i < 120; i += 1) layer.applyBodyIdle(1, 1 / 30, false, false);
    expect(Math.abs(scene.rotation.y - Math.PI * 2)).toBeLessThan(0.02);

    layer.setFaceAway(false);
    for (let i = 0; i < 120; i += 1) layer.applyBodyIdle(2, 1 / 30, false, false);
    expect(Math.abs(scene.rotation.y - Math.PI)).toBeLessThan(0.02);
  });
});
