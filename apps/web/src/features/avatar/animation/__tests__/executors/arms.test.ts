import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { NormalizedBoneRef } from '../../../pose/bones';
import { VrmAnimationRuntime } from '../../adapters/vrm';
import { reapplyPalms, solveArmTargets, solveHang } from '../../arms/solver';

interface ArmChain {
  upper: THREE.Object3D;
  lower: THREE.Object3D;
  hand: THREE.Object3D;
}

function makeArm(side: 'left' | 'right', scene: THREE.Object3D): ArmChain {
  const upper = new THREE.Object3D();
  upper.position.set(side === 'left' ? 0.2 : -0.2, 1.4, 0);
  scene.add(upper);
  const lower = new THREE.Object3D();
  lower.position.set(0, -0.3, 0);
  upper.add(lower);
  const hand = new THREE.Object3D();
  hand.position.set(0, -0.3, 0);
  lower.add(hand);
  return { upper, lower, hand };
}

function ref(name: string, node: THREE.Object3D): NormalizedBoneRef {
  return { name, node, baseQuat: new THREE.Quaternion() };
}

function poseArms(sceneYaw: number, frameYaw: number) {
  const scene = new THREE.Object3D();
  scene.rotation.y = sceneYaw;
  const left = makeArm('left', scene);
  const right = makeArm('right', scene);
  const nodes = new Map<string, NormalizedBoneRef>([
    ['leftUpperArm', ref('leftUpperArm', left.upper)],
    ['leftLowerArm', ref('leftLowerArm', left.lower)],
    ['leftHand', ref('leftHand', left.hand)],
    ['rightUpperArm', ref('rightUpperArm', right.upper)],
    ['rightLowerArm', ref('rightLowerArm', right.lower)],
    ['rightHand', ref('rightHand', right.hand)],
  ]);
  solveHang(nodes, 1, 0, frameYaw);
  scene.updateMatrixWorld(true);
  return { left, right };
}

function worldPos(node: THREE.Object3D): THREE.Vector3 {
  return node.getWorldPosition(new THREE.Vector3());
}

function palmNormal(hand: THREE.Object3D): THREE.Vector3 {
  return new THREE.Vector3(0, -1, 0)
    .applyQuaternion(hand.getWorldQuaternion(new THREE.Quaternion()))
    .normalize();
}

describe('待机手臂自然放松', () => {
  it('上臂略外展、前臂收回，形成肘部小弧度', () => {
    const { left } = poseArms(0, 0);
    const shoulder = worldPos(left.upper);
    const elbow = worldPos(left.lower);
    const wrist = worldPos(left.hand);
    const upperDir = elbow.clone().sub(shoulder).normalize();
    const lowerDir = wrist.clone().sub(elbow).normalize();

    expect(upperDir.angleTo(lowerDir)).toBeGreaterThan(0.1);
    // 上臂外展后手腕仍落在肩外侧，而不是贴着身体中线
    expect(wrist.x).toBeGreaterThan(shoulder.x);
  });

  it('背对时目标随身体转向，左右手不会收到中线', () => {
    const { left, right } = poseArms(Math.PI, Math.PI);
    expect(worldPos(left.hand).x).toBeLessThan(worldPos(left.upper).x);
    expect(worldPos(right.hand).x).toBeGreaterThan(worldPos(right.upper).x);
  });

  it('后置上臂调整后，reapplyPalms 让掌心回到意图方向', () => {
    reapplyPalms(new Map()); // 清掉上一用例遗留的掌心意图
    const scene = new THREE.Object3D();
    const left = makeArm('left', scene);
    // 真实手骨的掌心法线垂直于前臂；测试链默认 -Y 沿骨轴，这里先把手转成垂直
    left.hand.rotation.x = -Math.PI / 2;
    scene.updateMatrixWorld(true);
    const nodes = new Map<string, NormalizedBoneRef>([
      ['leftUpperArm', ref('leftUpperArm', left.upper)],
      ['leftLowerArm', ref('leftLowerArm', left.lower)],
      ['leftHand', ref('leftHand', left.hand)],
    ]);
    solveArmTargets(nodes, 'left', [0.2, -1, 0], [0, -1, 0], [-1, 0, 0], 1);
    scene.updateMatrixWorld(true);
    const target = () => {
      const forearm = worldPos(left.hand).sub(worldPos(left.lower)).normalize();
      return new THREE.Vector3(-1, 0, 0).projectOnPlane(forearm).normalize();
    };
    expect(palmNormal(left.hand).dot(target())).toBeGreaterThan(0.99);

    // 模拟呼吸/防穿模在手臂求解之后绕上臂骨轴扭转：前臂方向不变，但掌心朝向被带偏
    left.upper.rotateY(0.35);
    scene.updateMatrixWorld(true);
    expect(palmNormal(left.hand).dot(target())).toBeLessThan(0.99);

    reapplyPalms(nodes);
    expect(palmNormal(left.hand).dot(target())).toBeGreaterThan(0.99);
  });

  it('持物姿态把右手抬到髋前，左手保持不变', () => {
    const scene = new THREE.Object3D();
    const left = makeArm('left', scene);
    const right = makeArm('right', scene);
    const nodes = new Map<string, NormalizedBoneRef>([
      ['leftUpperArm', ref('leftUpperArm', left.upper)],
      ['leftLowerArm', ref('leftLowerArm', left.lower)],
      ['leftHand', ref('leftHand', left.hand)],
      ['rightUpperArm', ref('rightUpperArm', right.upper)],
      ['rightLowerArm', ref('rightLowerArm', right.lower)],
      ['rightHand', ref('rightHand', right.hand)],
    ]);
    const runtime = new VrmAnimationRuntime(nodes);
    runtime.captureBase();
    scene.updateMatrixWorld(true);
    const leftBefore = worldPos(left.hand).clone();

    runtime.applyPose('pose.prop-hold', 1, 0, false);
    scene.updateMatrixWorld(true);

    expect(worldPos(right.hand).z).toBeGreaterThan(0.1);
    expect(worldPos(left.hand).distanceTo(leftBefore)).toBeLessThan(1e-6);
  });
});
