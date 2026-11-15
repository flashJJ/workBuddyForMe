import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { aimBone, orientPalm } from './arm-relax';

function makeArm() {
  const root = new THREE.Object3D();
  const upper = new THREE.Object3D();
  upper.position.set(0, 1, 0);
  const lower = new THREE.Object3D();
  lower.position.set(0.5, 0, 0); // T-pose：手臂沿 +X
  const hand = new THREE.Object3D();
  hand.position.set(0.5, 0, 0);
  root.add(upper);
  upper.add(lower);
  lower.add(hand);
  root.updateMatrixWorld(true);
  return { root, upper, lower, hand };
}

function armDir(upper: THREE.Object3D, lower: THREE.Object3D) {
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  upper.getWorldPosition(a);
  lower.getWorldPosition(b);
  return b.sub(a).normalize();
}

describe('世界方向对齐（aimBone）', () => {
  it('T-pose 上臂被转到目标方向', () => {
    const { upper, lower } = makeArm();
    aimBone(upper, lower, new THREE.Vector3(0.26, -1, 0.04), 1);
    const dir = armDir(upper, lower);
    expect(dir.y).toBeLessThan(-0.9);
    expect(dir.x).toBeGreaterThan(0.1);
  });

  it('weight=0 保持原姿势，weight=0.5 介于中间', () => {
    const rest = makeArm();
    const before = armDir(rest.upper, rest.lower);
    aimBone(rest.upper, rest.lower, new THREE.Vector3(0.16, -1, 0.04), 0);
    expect(armDir(rest.upper, rest.lower).x).toBeCloseTo(before.x, 5);

    const half = makeArm();
    aimBone(half.upper, half.lower, new THREE.Vector3(0.26, -1, 0.04), 0.5);
    const dir = armDir(half.upper, half.lower);
    expect(dir.y).toBeGreaterThan(-0.9);
    expect(dir.y).toBeLessThan(0);
  });

  it('零长度骨骼安全跳过', () => {
    const { upper, lower } = makeArm();
    lower.position.set(0, 0, 0);
    upper.updateMatrixWorld(true);
    expect(() => aimBone(upper, lower, new THREE.Vector3(0, -1, 0), 1)).not.toThrow();
  });
});

describe('掌心 roll（orientPalm）', () => {
  function palmNormal(hand: THREE.Object3D): THREE.Vector3 {
    return new THREE.Vector3(0, -1, 0)
      .applyQuaternion(hand.getWorldQuaternion(new THREE.Quaternion()))
      .normalize();
  }

  it('局部 -Y 是掌心法线：绕前臂轴转向目标', () => {
    const { hand } = makeArm();
    orientPalm(hand, new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), 1);
    const normal = palmNormal(hand);
    expect(normal.z).toBeCloseTo(1, 5);
    expect(Math.abs(normal.y)).toBeLessThan(1e-5);
  });

  it('weight=0.5 只转一半角度', () => {
    const { hand } = makeArm();
    orientPalm(hand, new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), 0.5);
    const normal = palmNormal(hand);
    expect(normal.y).toBeCloseTo(-Math.SQRT1_2, 5);
    expect(normal.z).toBeCloseTo(Math.SQRT1_2, 5);
  });

  it('目标与前臂平行时跳过，不产生 NaN', () => {
    const { hand } = makeArm();
    expect(() => orientPalm(hand, new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 0, 0), 1)).not.toThrow();
    expect(Number.isNaN(palmNormal(hand).x)).toBe(false);
  });
});
