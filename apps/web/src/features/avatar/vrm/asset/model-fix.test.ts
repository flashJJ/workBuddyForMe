import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { applyDoubleSidedCloth, freezeUnstableClothSprings } from './model-fix';

function mesh(name: string, materialName: string, side = THREE.FrontSide): THREE.Mesh {
  const material = new THREE.MeshBasicMaterial({ name: materialName, side });
  const value = new THREE.Mesh(new THREE.BoxGeometry(), material);
  value.name = name;
  return value;
}

function fakeJoint(name: string, colliderCount = 0) {
  const bone = new THREE.Bone();
  bone.name = name;
  return {
    bone,
    colliderGroups: [{ colliders: Array.from({ length: colliderCount }, () => ({})) }],
    reset: vi.fn(),
  };
}

function fakeVrm(joints: ReturnType<typeof fakeJoint>[]): VRM {
  const scene = new THREE.Group();
  const set = new Set(joints);
  const springBoneManager = {
    joints: set,
    deleteJoint: (joint: unknown) => set.delete(joint as ReturnType<typeof fakeJoint>),
  };
  return { scene, springBoneManager } as unknown as VRM;
}

describe('applyDoubleSidedCloth（v3.0 P1 裙摆双面）', () => {
  it('只把布料/身体改为双面，跳过头发与描边', () => {
    const vrm = fakeVrm([]);
    vrm.scene.add(
      mesh('Body_Model_down', 'material_body'),
      mesh('Dress_01', 'cloth'),
      mesh('Hair_01', 'hair'),
      mesh('Dress_01', 'dress_cloth (Outline)'),
    );
    expect(applyDoubleSidedCloth(vrm)).toBe(2);
    const sides = vrm.scene.children.map((child) => (child as THREE.Mesh).material as THREE.Material);
    expect(sides[0]!.side).toBe(THREE.DoubleSide);
    expect(sides[1]!.side).toBe(THREE.DoubleSide);
    expect(sides[2]!.side).toBe(THREE.FrontSide);
    expect(sides[3]!.side).toBe(THREE.FrontSide);
  });
});

describe('freezeUnstableClothSprings（v3.0 P1 过载弹簧冻结）', () => {
  it('重复 dress 关节全部冻结', () => {
    const joints = [fakeJoint('dress_01'), fakeJoint('dress_01'), fakeJoint('dress_02')];
    const vrm = fakeVrm(joints);
    expect(freezeUnstableClothSprings(vrm)).toBe(3);
    expect(vrm.springBoneManager!.joints.size).toBe(0);
    expect(joints[0]!.reset).toHaveBeenCalled();
  });

  it('碰撞体过载时冻结', () => {
    const joints = [fakeJoint('skirt_01', 25)];
    const vrm = fakeVrm(joints);
    expect(freezeUnstableClothSprings(vrm)).toBe(1);
  });

  it('正常布料弹簧保持不动', () => {
    const joints = [fakeJoint('dress_01'), fakeJoint('dress_02', 4)];
    const vrm = fakeVrm(joints);
    expect(freezeUnstableClothSprings(vrm)).toBe(0);
    expect(vrm.springBoneManager!.joints.size).toBe(2);
  });
});
