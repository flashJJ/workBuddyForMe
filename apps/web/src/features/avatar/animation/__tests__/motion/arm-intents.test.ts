import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { BoneMask } from '../../contracts';
import type { NormalizedBoneRef } from '../../../pose/bones';
import { VrmAnimationRuntime } from '../../adapters/vrm';
import { POSE_ARM_INTENTS } from '../../arms/pose-intents';
import { NORM_BONE_NAMES } from '../../mask';

const ACCENT: BoneMask = {
  include: ['spine', 'head', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'],
};
const ARM_BONES = new Set([
  'leftUpperArm', 'leftLowerArm', 'leftHand',
  'rightUpperArm', 'rightLowerArm', 'rightHand',
]);

function ref(name: string, node: THREE.Object3D): NormalizedBoneRef {
  return { name, node, baseQuat: node.quaternion.clone() };
}

function makeRig() {
  const scene = new THREE.Object3D();
  const bones = new Map<string, NormalizedBoneRef>();
  for (const name of NORM_BONE_NAMES) {
    if (ARM_BONES.has(name)) continue;
    const node = new THREE.Object3D();
    scene.add(node);
    bones.set(name, ref(name, node));
  }
  for (const side of ['left', 'right'] as const) {
    const sign = side === 'left' ? 1 : -1;
    const upper = new THREE.Object3D();
    upper.position.set(sign * 0.2, 1.4, 0);
    scene.add(upper);
    const lower = new THREE.Object3D();
    lower.position.set(0, -0.3, 0);
    upper.add(lower);
    const hand = new THREE.Object3D();
    hand.position.set(0, -0.3, 0);
    lower.add(hand);
    bones.set(`${side}UpperArm`, ref(`${side}UpperArm`, upper));
    bones.set(`${side}LowerArm`, ref(`${side}LowerArm`, lower));
    bones.set(`${side}Hand`, ref(`${side}Hand`, hand));
  }
  scene.updateMatrixWorld(true);
  return { scene, bones };
}

function worldDir(bones: Map<string, NormalizedBoneRef>, from: string, to: string): THREE.Vector3 {
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  bones.get(from)!.node.getWorldPosition(a);
  bones.get(to)!.node.getWorldPosition(b);
  return b.sub(a).normalize();
}

function expectMotionArms(motionId: string, ms: number, poseId: string): void {
  const { scene, bones } = makeRig();
  const runtime = new VrmAnimationRuntime(bones);
  runtime.captureBase();
  runtime.applyMotion(motionId, ms, 1, 0, ACCENT);
  scene.updateMatrixWorld(true);
  const intent = POSE_ARM_INTENTS[poseId];
  expect(intent).toBeDefined();
  if (!intent) return;
  for (const side of ['left', 'right'] as const) {
    const upper = new THREE.Vector3(...intent[side].upper);
    const lower = new THREE.Vector3(...intent[side].lower);
    const upperDir = worldDir(bones, `${side}UpperArm`, `${side}LowerArm`);
    const lowerDir = worldDir(bones, `${side}LowerArm`, `${side}Hand`);
    expect(upperDir.angleTo(upper)).toBeLessThan(0.01);
    expect(lowerDir.angleTo(lower)).toBeLessThan(0.01);
  }
}

describe('动作采样接管手臂意图', () => {
  it('双手身前：关键帧稳定在意图方向', () => {
    expectMotionArms('motion.hands-front', 1200, 'pose.stance-hands-front');
  });

  it('双手插兜：关键帧稳定在意图方向', () => {
    expectMotionArms('motion.hands-pocket', 1500, 'pose.stance-hands-pocket');
  });

  it('抱臂：关键帧稳定在意图方向', () => {
    expectMotionArms('motion.arms-crossed', 1500, 'pose.stance-arms-crossed');
  });

  it('害羞：左手前收、右手横过胸前', () => {
    expectMotionArms('motion.shy', 1000, 'pose.shy');
  });
});
