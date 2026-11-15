import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { NormalizedBoneRef } from '../../../pose/bones';
import { applyTwoBoneIk } from '../../adapters/vrm-ik';
import { direction, softenTarget, solveTwoBone, solveTwoBoneSoft } from '../../ik';

describe('两骨解析 IK', () => {
  it('可达目标：关节到根/末端都等于段长', () => {
    const solution = solveTwoBone({ x: 0, y: 0, z: 0 }, { x: 0, y: 0.8, z: 1 }, { x: 1, y: 0, z: 0 }, 1, 1);
    expect(solution.reachable).toBe(true);
    expect(Math.hypot(solution.joint.x, solution.joint.y, solution.joint.z)).toBeCloseTo(1, 5);
    expect(
      Math.hypot(solution.end.x - solution.joint.x, solution.end.y - solution.joint.y, solution.end.z - solution.joint.z),
    ).toBeCloseTo(1, 5);
    expect(solution.end.z).toBeCloseTo(1, 5);
  });

  it('超出长度时钳位到最大可达点', () => {
    const solution = solveTwoBone({ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }, null, 1, 1);
    expect(solution.reachable).toBe(false);
    expect(solution.end.x).toBeCloseTo(2, 5);
    expect(Math.hypot(solution.joint.x, solution.joint.y, solution.joint.z)).toBeCloseTo(1, 5);
  });

  it('目标过近时钳位到最短距离', () => {
    const solution = solveTwoBone({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, null, 1.2, 0.4);
    expect(solution.reachable).toBe(false);
    expect(Math.hypot(solution.end.x, solution.end.y, solution.end.z)).toBeCloseTo(0.8, 5);
  });

  it('极点退化与方向辅助函数不产生 NaN', () => {
    const solution = solveTwoBone({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 2 }, 1, 1);
    for (const value of Object.values(solution.joint)) expect(Number.isFinite(value)).toBe(true);
    expect(direction({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })).toBeNull();
    expect(direction({ x: 0, y: 0, z: 0 }, { x: 0, y: 2, z: 0 })).toEqual({ x: 0, y: 1, z: 0 });
  });

  it('soft IK：relax=0 与硬解一致，relax=1 保持基准末端', () => {
    const root = { x: 0, y: 0, z: 0 };
    const target = { x: 0, y: 0.6, z: 1.2 };
    const pole = { x: 1, y: 0, z: 0 };
    const prior = { end: { x: 0, y: 0.2, z: 0.4 }, joint: { x: 0.6, y: 0.4, z: 0.2 }, relax: 0 };
    const hard = solveTwoBone(root, target, pole, 1, 1);
    const zero = solveTwoBoneSoft(root, target, pole, 1, 1, prior);
    expect(zero.end.x).toBeCloseTo(hard.end.x, 5);
    expect(zero.end.y).toBeCloseTo(hard.end.y, 5);

    const full = solveTwoBoneSoft(root, target, pole, 1, 1, { ...prior, relax: 1 });
    expect(full.end.x).toBeCloseTo(prior.end.x, 5);
    expect(full.end.y).toBeCloseTo(prior.end.y, 5);
  });

  it('soft IK：先验关节让弯曲平面更接近原姿态', () => {
    const root = { x: 0, y: 0, z: 0 };
    const target = { x: 0, y: 0.8, z: 0.8 };
    const prior = { end: { x: 0, y: 0.6, z: 0.2 }, joint: { x: 1, y: 0, z: 0 }, relax: 0.5 };
    const softened = softenTarget(target, { x: -1, y: 0, z: 0 }, prior);
    expect(softened.pole?.x).toBeCloseTo(0, 5);
    expect(softened.target.z).toBeLessThan(target.z);
  });
});

describe('VRM 两骨 IK 适配', () => {
  function makeChain(): {
    bones: Map<string, NormalizedBoneRef>;
    end: THREE.Object3D;
  } {
    const scene = new THREE.Object3D();
    const upper = new THREE.Object3D();
    const lower = new THREE.Object3D();
    const end = new THREE.Object3D();
    scene.add(upper);
    upper.add(lower);
    lower.position.set(1, 0, 0);
    lower.add(end);
    end.position.set(1, 0, 0);
    const bones = new Map<string, NormalizedBoneRef>([
      ['leftUpperArm', { name: 'leftUpperArm', node: upper, baseQuat: upper.quaternion.clone() }],
      ['leftLowerArm', { name: 'leftLowerArm', node: lower, baseQuat: lower.quaternion.clone() }],
      ['leftHand', { name: 'leftHand', node: end, baseQuat: end.quaternion.clone() }],
    ]);
    scene.updateMatrixWorld(true);
    return { bones, end };
  }

  it('可达目标时末端落到目标点', () => {
    const { bones, end } = makeChain();
    const target = { x: 0, y: 0.8, z: 1 };
    expect(
      applyTwoBoneIk(bones, {
        upper: 'leftUpperArm',
        lower: 'leftLowerArm',
        end: 'leftHand',
        target,
      }),
    ).toBe(true);
    const world = new THREE.Vector3();
    end.getWorldPosition(world);
    expect(world.distanceTo(new THREE.Vector3(target.x, target.y, target.z))).toBeLessThan(0.02);
  });

  it('骨骼缺失时安全返回 false', () => {
    const { bones } = makeChain();
    expect(
      applyTwoBoneIk(bones, {
        upper: 'rightUpperArm',
        lower: 'rightLowerArm',
        end: 'rightHand',
        target: { x: 0, y: 0, z: 1 },
      }),
    ).toBe(false);
  });
});
