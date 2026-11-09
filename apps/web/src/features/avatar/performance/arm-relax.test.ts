import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { aimBone, relaxArm } from './arm-relax';

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

describe('待机手臂放松（v3.0 P1）', () => {
  it('T-pose 上臂被转到自然下垂（略外）', () => {
    const { upper, lower, hand } = makeArm();
    relaxArm(upper, lower, hand, 'left', 1, 1);
    const dir = armDir(upper, lower);
    expect(dir.y).toBeLessThan(-0.9);
    expect(dir.x).toBeGreaterThan(0.1);
    expect(Math.abs(dir.z)).toBeLessThan(0.1);
  });

  it('右臂镜像；前臂也向下', () => {
    const { root, upper, lower, hand } = makeArm();
    upper.position.set(0, 1, 0);
    lower.position.set(-0.5, 0, 0);
    hand.position.set(-0.5, 0, 0);
    root.updateMatrixWorld(true);
    relaxArm(upper, lower, hand, 'right', 1, 1);
    expect(armDir(upper, lower).x).toBeLessThan(-0.1);

    const elbow = new THREE.Vector3();
    const wrist = new THREE.Vector3();
    lower.getWorldPosition(elbow);
    hand.getWorldPosition(wrist);
    expect(wrist.sub(elbow).normalize().y).toBeLessThan(-0.9);
  });

  it('weight=0 保持原姿势，weight=0.5 介于中间', () => {
    const rest = makeArm();
    const before = armDir(rest.upper, rest.lower);
    aimBone(rest.upper, rest.lower, new THREE.Vector3(0.16, -1, 0.04), 0);
    expect(armDir(rest.upper, rest.lower).x).toBeCloseTo(before.x, 5);

    const half = makeArm();
    relaxArm(half.upper, half.lower, half.hand, 'left', 0.5, 0.5);
    const dir = armDir(half.upper, half.lower);
    expect(dir.y).toBeGreaterThan(-0.9);
    expect(dir.y).toBeLessThan(0);
  });

  it('零长度骨骼安全跳过', () => {
    const { upper, lower, hand } = makeArm();
    lower.position.set(0, 0, 0);
    hand.position.set(0, 0, 0);
    upper.updateMatrixWorld(true);
    expect(() => relaxArm(upper, lower, hand, 'left', 1, 1)).not.toThrow();
  });
});
