import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { VRM } from '@pixiv/three-vrm';
import { computeSeatProp, type SeatRig } from '../../animation/seating';
import { VrmSeatProp } from './vrm-seat-prop';

const RIG: SeatRig = { hipLocalY: 0.7, ankleLocalY: 0.06, legLengthM: 0.65 };
const HIP = { x: 0.05, y: 0.7, z: 0.02 };

function makeVrm(): { scene: THREE.Object3D; prop: VrmSeatProp } {
  const scene = new THREE.Object3D();
  const prop = new VrmSeatProp({ scene } as unknown as VRM);
  return { scene, prop };
}

function meshOf(scene: THREE.Object3D): THREE.Mesh & { material: THREE.MeshStandardMaterial } {
  return scene.children[0] as THREE.Mesh & { material: THREE.MeshStandardMaterial };
}

describe('VrmSeatProp（座位道具）', () => {
  it('初始隐藏且缩到 0：不参与取景包围盒', () => {
    const { scene } = makeVrm();
    const mesh = meshOf(scene);
    expect(mesh.name).toBe('pet-seat-prop');
    expect(mesh.visible).toBe(false);
    expect(mesh.scale.x).toBe(0);
    expect(mesh.material.opacity).toBe(0);
  });

  it('坐面贴在臀部下方，前缘对齐髋中心', () => {
    const { scene, prop } = makeVrm();
    prop.update(RIG, 'sill', 1, HIP, { x: 0, z: -1 });
    const mesh = meshOf(scene);
    const spec = computeSeatProp('sill', RIG);
    expect(mesh.visible).toBe(true);
    expect(mesh.position.x).toBeCloseTo(HIP.x, 5);
    // 前缘 = 髋中心 + 2% 髋高，盒心再按进深补一半
    expect(mesh.position.z).toBeCloseTo(HIP.z - (spec.frontGapM + spec.depth / 2), 5);
    // 盒子中心 + 半厚 = 上表面
    expect(mesh.position.y + spec.thickness / 2).toBeCloseTo(HIP.y - spec.contactDropM, 5);
    expect(mesh.scale.x).toBeCloseTo(spec.width, 5);
    expect(mesh.scale.y).toBeCloseTo(spec.thickness, 5);
    expect(mesh.scale.z).toBeCloseTo(spec.depth, 5);
  });

  it('按坐姿权重淡入淡出，权重归零后重新隐藏', () => {
    const { scene, prop } = makeVrm();
    const mesh = meshOf(scene);
    prop.update(RIG, 'sill', 0.4, HIP, { x: 0, z: -1 });
    expect(mesh.material.opacity).toBeCloseTo(0.4, 5);
    prop.update(RIG, 'sill', 0, HIP, { x: 0, z: -1 });
    expect(mesh.visible).toBe(false);
    expect(mesh.scale.x).toBe(0);
  });

  it('切换坐姿模式时换成对应颜色', () => {
    const { scene, prop } = makeVrm();
    const mesh = meshOf(scene);
    prop.update(RIG, 'sill', 1, HIP, { x: 0, z: -1 });
    const sillColor = mesh.material.color.getHex();
    prop.update(RIG, 'desk', 1, HIP, { x: 0, z: -1 });
    expect(mesh.material.color.getHex()).toBe(computeSeatProp('desk', RIG).color);
    expect(mesh.material.color.getHex()).not.toBe(sillColor);
  });
});
