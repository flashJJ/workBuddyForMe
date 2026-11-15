import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { describe, expect, it } from 'vitest';
import { createVrmSkeleton } from '../../animation/adapters/vrm';
import type { NormalizedBoneRef } from '../../pose/bones';
import { VrmPoseLayer } from '../vrm-pose-layer';

/**
 * 持物姿态与行为的抢占关系：
 * - 无行为时，prop-hold 会把右臂摆到持物方向；
 * - 行为已摆到右臂时（如托腮/伏案），整臂让给行为，只补手指握型。
 */
function makeRig(): {
  layer: VrmPoseLayer;
  rightUpperArm: THREE.Object3D;
  indexProximal: THREE.Object3D;
} {
  const scene = new THREE.Object3D();
  scene.rotation.y = Math.PI;
  const bones = new Map<string, NormalizedBoneRef>();
  const nodes = new Map<string, THREE.Object3D>();
  const add = (name: string, parent: string | null, pos: [number, number, number]) => {
    const node = new THREE.Object3D();
    node.position.set(...pos);
    (parent ? nodes.get(parent)! : scene).add(node);
    nodes.set(name, node);
    bones.set(name, { name, node, baseQuat: node.quaternion.clone() });
  };
  add('spine', null, [0, 0.95, 0]);
  add('neck', 'spine', [0, 0.3, 0]);
  add('head', 'neck', [0, 0.1, 0]);
  add('rightShoulder', 'spine', [-0.05, 0.2, 0]);
  add('rightUpperArm', 'rightShoulder', [-0.12, 0, 0]);
  add('rightLowerArm', 'rightUpperArm', [-0.26, 0, 0]);
  add('rightHand', 'rightLowerArm', [-0.25, 0, 0]);
  add('rightIndexProximal', 'rightHand', [-0.02, 0, 0]);
  add('rightIndexIntermediate', 'rightIndexProximal', [-0.02, 0, 0]);

  const skeleton = createVrmSkeleton(bones);
  skeleton.capture();
  const layer = new VrmPoseLayer({ scene, lookAt: null } as unknown as VRM, bones);
  layer.captureBase();
  return {
    layer,
    rightUpperArm: nodes.get('rightUpperArm')!,
    indexProximal: nodes.get('rightIndexProximal')!,
  };
}

function tick(layer: VrmPoseLayer, frames: number): void {
  for (let i = 0; i < frames; i += 1) {
    layer.resetOverlayBones();
    layer.captureMixerPose();
    layer.applyHeadOverlay(i / 30, true, 1 / 30, 1);
  }
}

describe('VrmPoseLayer.applyPropHold 与行为共存', () => {
  it('无行为时整臂摆到持物方向', () => {
    const { layer, rightUpperArm } = makeRig();
    const before = rightUpperArm.quaternion.clone();
    layer.applyPropHold('pose.prop-hold');
    expect(rightUpperArm.quaternion.angleTo(before)).toBeGreaterThan(0.1);
  });

  it('行为接管右臂时保留行为姿势，只补手指握型', () => {
    const { layer, rightUpperArm, indexProximal } = makeRig();
    layer.playBehavior('behavior.chin-rest');
    tick(layer, 40);

    const armBefore = rightUpperArm.quaternion.clone();
    layer.applyPropHold('pose.prop-hold');

    expect(rightUpperArm.quaternion.angleTo(armBefore)).toBeLessThan(1e-6);
    expect(Math.abs(indexProximal.quaternion.z)).toBeGreaterThan(0.1);
  });
});
