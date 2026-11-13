import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { VrmAnimationRuntime, createVrmSkeleton } from '../adapters/vrm';
import type { BoneQuat } from '../contracts';
import type { NormalizedBoneRef } from '../../pose/bones';

function ref(name: string, node: THREE.Object3D): NormalizedBoneRef {
  return { name, node, baseQuat: node.quaternion.clone() };
}

/** 最小手臂链：肩 → 上臂 → 前臂 → 手，骨骼朝 +X，便于世界空间垂臂求解 */
function makeRig(): { bones: Map<string, NormalizedBoneRef>; upperArm: THREE.Object3D; head: THREE.Object3D } {
  const spine = new THREE.Object3D();
  const neck = new THREE.Object3D();
  const head = new THREE.Object3D();
  const shoulder = new THREE.Object3D();
  const upperArm = new THREE.Object3D();
  const lowerArm = new THREE.Object3D();
  const hand = new THREE.Object3D();
  spine.add(neck);
  neck.add(head);
  spine.add(shoulder);
  shoulder.add(upperArm);
  upperArm.position.set(0.2, 0, 0);
  upperArm.add(lowerArm);
  lowerArm.position.set(0.2, 0, 0);
  lowerArm.add(hand);
  hand.position.set(0.2, 0, 0);
  const bones = new Map<string, NormalizedBoneRef>([
    ['spine', ref('spine', spine)],
    ['neck', ref('neck', neck)],
    ['head', ref('head', head)],
    ['leftUpperArm', ref('leftUpperArm', upperArm)],
    ['leftLowerArm', ref('leftLowerArm', lowerArm)],
    ['leftHand', ref('leftHand', hand)],
  ]);
  return { bones, upperArm, head };
}

describe('createVrmSkeleton', () => {
  it('读写 three 骨骼四元数', () => {
    const node = new THREE.Object3D();
    const skeleton = createVrmSkeleton(new Map([['head', ref('head', node)]]));
    const quat: BoneQuat = { x: 0, y: 0.1, z: 0, w: 0.995 };
    expect(skeleton.write('head', quat)).toBe(true);
    const out: BoneQuat = { x: 0, y: 0, z: 0, w: 1 };
    expect(skeleton.read('head', out)).toBe(true);
    expect(out.y).toBeCloseTo(0.1, 6);
    expect(node.quaternion.y).toBeCloseTo(0.1, 6);
  });
});

describe('VrmAnimationRuntime', () => {
  it('applyPose additive=false 每帧从绑定姿态重算，重复调用不累加', () => {
    const { bones, head } = makeRig();
    const runtime = new VrmAnimationRuntime(bones);
    runtime.captureBase();
    runtime.applyPose('pose.head-down', 1, 0, false);
    const first = head.quaternion.clone();
    runtime.applyPose('pose.head-down', 1, 0, false);
    expect(head.quaternion.angleTo(first)).toBeCloseTo(0, 5);
    // 默认 additive 仍叠加在当前姿态上
    runtime.applyPose('pose.head-down', 1, 0);
    expect(head.quaternion.angleTo(first)).toBeGreaterThan(0.01);
  });

  it('行为姿势按阶段合成到骨架（idle → 垂臂）', () => {
    const { bones, upperArm } = makeRig();
    const runtime = new VrmAnimationRuntime(bones);
    runtime.captureBase();
    runtime.captureFrame();
    const base = upperArm.quaternion.clone();

    expect(runtime.play('behavior.idle')).toBe(true);
    expect(runtime.snapshot.phase).toBe('loop');
    runtime.update(300);
    expect(runtime.snapshot.id).toBe('behavior.idle');
    expect(upperArm.quaternion.angleTo(base)).toBeGreaterThan(0.05);
  });

  it('停止后写回帧快照，不残留姿势', () => {
    const { bones, upperArm } = makeRig();
    const runtime = new VrmAnimationRuntime(bones);
    runtime.captureBase();
    runtime.captureFrame();
    const base = upperArm.quaternion.clone();

    runtime.play('behavior.idle');
    runtime.update(300);
    expect(upperArm.quaternion.angleTo(base)).toBeGreaterThan(0.05);

    runtime.stop();
    runtime.update(200);
    expect(runtime.active).toBe(false);
    expect(upperArm.quaternion.angleTo(base)).toBeLessThan(1e-6);
  });

  it('dt = 0 冻结行为时钟', () => {
    const runtime = new VrmAnimationRuntime(makeRig().bones);
    runtime.captureBase();
    runtime.play('behavior.idle');
    runtime.update(100);
    const elapsed = runtime.snapshot.elapsedMs;
    runtime.update(0);
    expect(runtime.snapshot.elapsedMs).toBe(elapsed);
  });

  it('lifted 行为输出 root 位移，结束后归零', () => {
    const runtime = new VrmAnimationRuntime(makeRig().bones);
    runtime.captureBase();
    runtime.captureFrame();

    expect(runtime.play('behavior.lifted')).toBe(true);
    runtime.update(400);
    expect(runtime.snapshot.id).toBe('behavior.lifted');
    expect(runtime.root.y).toBeGreaterThan(0.05);

    runtime.stop();
    runtime.update(400);
    expect(runtime.active).toBe(false);
    expect(runtime.root.y).toBe(0);
  });
});
