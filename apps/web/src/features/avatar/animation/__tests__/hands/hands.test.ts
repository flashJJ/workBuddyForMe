import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { BoneRotation } from '../../contracts';
import type { VRM } from '@pixiv/three-vrm';
import type { NormalizedBoneRef } from '../../../pose/bones';
import { VrmPoseLayer } from '../../../vrm/vrm-pose-layer';
import { VrmAnimationRuntime } from '../../adapters/vrm';
import { NORM_BONE_NAMES } from '../../mask';
import { sampleMotion, type MotionSample } from '../../motion';
import { MOTIONS } from '../../motions';
import { POSES } from '../../poses';

function makeRig(): { vrm: VRM; bones: Map<string, NormalizedBoneRef>; scene: THREE.Object3D } {
  const scene = new THREE.Object3D();
  scene.rotation.y = Math.PI;
  const bones = new Map<string, NormalizedBoneRef>();
  for (const name of NORM_BONE_NAMES) {
    const node = new THREE.Object3D();
    scene.add(node);
    bones.set(name, { name, node, baseQuat: node.quaternion.clone() });
  }
  return { vrm: { scene, lookAt: null } as unknown as VRM, bones, scene };
}

function angleOf(bones: Map<string, NormalizedBoneRef>, name: string): number {
  const ref = bones.get(name);
  return ref ? new THREE.Quaternion().angleTo(ref.node.quaternion) : Number.NaN;
}

function poseBones(id: string): Partial<Record<string, BoneRotation>> {
  return POSES.find((pose) => pose.id === id)?.bones ?? {};
}

describe('手部姿势组件（L1）', () => {
  it('握拳屈曲大于放松，摊开为轻微伸展并带张开', () => {
    const fist = poseBones('pose.hand-left-fist');
    const relaxed = poseBones('pose.hand-left-relaxed');
    const open = poseBones('pose.hand-left-open');
    expect(fist['leftIndexProximal']?.z ?? 0).toBeGreaterThan(relaxed['leftIndexProximal']?.z ?? 0);
    expect(open['leftIndexProximal']?.z ?? 0).toBeLessThan(0);
    expect(open['leftIndexProximal']?.y).toBeCloseTo(-0.1, 6);
    expect(open['leftLittleProximal']?.y).toBeCloseTo(0.14, 6);
  });

  it('右手镜像：屈曲与张开符号取反', () => {
    const left = poseBones('pose.hand-left-fist');
    const right = poseBones('pose.hand-right-fist');
    expect(right['rightIndexProximal']?.z).toBeCloseTo(-(left['leftIndexProximal']?.z ?? 0), 6);

    const openLeft = poseBones('pose.hand-left-open');
    const openRight = poseBones('pose.hand-right-open');
    expect(openRight['rightIndexProximal']?.y).toBeCloseTo(
      -(openLeft['leftIndexProximal']?.y ?? 0),
      6,
    );
  });

  it('持杯半握介于放松与握拳之间，且不写手骨（保留掌心 roll）', () => {
    const cup = poseBones('pose.hand-left-cup-hold');
    const relaxed = poseBones('pose.hand-left-relaxed');
    const fist = poseBones('pose.hand-left-fist');
    const cupIndex = cup['leftIndexProximal']?.z ?? 0;
    expect(cupIndex).toBeGreaterThan(relaxed['leftIndexProximal']?.z ?? 0);
    expect(cupIndex).toBeLessThan(fist['leftIndexProximal']?.z ?? 0);
    expect(cup['leftHand']).toBeUndefined();
    expect(cup['leftThumbMetacarpal']?.y).toBeLessThan(0);
  });
});

describe('手部动作集（L2）', () => {
  const motion = MOTIONS.find((item) => item.id === 'motion.hand-fidget-left');
  const sample = (ms: number): MotionSample => {
    const out: MotionSample = { from: '', to: '', t: 0, timeMs: 0, done: true };
    if (!motion) throw new Error('缺少 motion.hand-fidget-left');
    return sampleMotion(out, motion, ms);
  };

  it('关键帧顺序为 放松 → 握拳 → 摊开 → 放松', () => {
    expect(sample(1000).from).toBe('pose.hand-left-fist');
    expect(sample(2500).from).toBe('pose.hand-left-open');
    expect(sample(5000).from).toBe('pose.hand-left-relaxed');
  });

  it('6.4s 循环，越界后回到开头', () => {
    expect(sample(6400).timeMs).toBe(0);
    expect(sample(7000).timeMs).toBe(600);
  });
});

describe('待机手部组件接线', () => {
  it('applyMotion 写入握拳且重复调用不累加', () => {
    const { bones } = makeRig();
    const runtime = new VrmAnimationRuntime(bones);
    runtime.captureBase();

    runtime.applyMotion('motion.hand-fidget-left', 1000, 1);
    const fist = angleOf(bones, 'leftIndexProximal');
    expect(fist).toBeGreaterThan(1);

    runtime.applyMotion('motion.hand-fidget-left', 1000, 1);
    expect(angleOf(bones, 'leftIndexProximal')).toBeCloseTo(fist, 6);

    runtime.applyMotion('motion.hand-fidget-left', 2500, 1);
    expect(angleOf(bones, 'leftIndexProximal')).toBeLessThan(0.2);
  });

  it('待机时左右手错峰：一只手动作时另一只放松', () => {
    const { vrm, bones } = makeRig();
    const layer = new VrmPoseLayer(vrm, bones);
    layer.captureBase();

    layer.relaxArms(1, 1);
    expect(angleOf(bones, 'leftIndexProximal')).toBeGreaterThan(
      angleOf(bones, 'rightIndexProximal'),
    );

    layer.relaxArms(1, 4);
    expect(angleOf(bones, 'rightIndexProximal')).toBeGreaterThan(
      angleOf(bones, 'leftIndexProximal'),
    );
  });
});
