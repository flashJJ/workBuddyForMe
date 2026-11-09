import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { VrmTailLayer } from './tail-layer';

function fakeVrm(springTail = false) {
  const scene = new THREE.Group();
  const hip = new THREE.Bone();
  hip.name = 'DEF-Hips';
  const tail1 = new THREE.Bone();
  tail1.name = 'tail_01';
  const tail2 = new THREE.Bone();
  tail2.name = 'tail_02';
  const other = new THREE.Bone();
  other.name = 'Hair_01';
  hip.add(tail1);
  tail1.add(tail2);
  scene.add(hip, other);
  const manager = springTail ? { joints: new Set([{ bone: tail1 }]) } : null;
  return { scene, springBoneManager: manager } as unknown as VRM;
}

describe('VrmTailLayer（v3.0 P1 尾巴摆动）', () => {
  it('收集 tail 骨并忽略非 tail 骨', () => {
    const layer = new VrmTailLayer(fakeVrm());
    expect(layer.count).toBe(2);
  });

  it('已由 SpringBone 接管的 tail 骨不重复驱动', () => {
    expect(new VrmTailLayer(fakeVrm(true)).count).toBe(1);
  });

  it('update 会摆动 tail 骨且不改其他骨骼', () => {
    const vrm = fakeVrm();
    const layer = new VrmTailLayer(vrm);
    const tail = vrm.scene.getObjectByName('tail_01')!;
    const other = vrm.scene.getObjectByName('Hair_01')!;
    const base = tail.quaternion.clone();
    const otherBase = other.quaternion.clone();
    layer.update(1.25);
    expect(tail.quaternion.equals(base)).toBe(false);
    expect(other.quaternion.equals(otherBase)).toBe(true);
  });
});
