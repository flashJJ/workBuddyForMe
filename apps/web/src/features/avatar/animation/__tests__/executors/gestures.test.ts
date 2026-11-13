import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createVrmSkeleton, VrmAnimationRuntime } from '../../adapters/vrm';
import { POSE_EXECUTORS } from '../../adapters/vrm-executors';
import type { NormalizedBoneRef } from '../../../pose/bones';

type Vec = THREE.Vector3;

const FINGERS = [
  { name: 'Index', segments: ['Proximal', 'Intermediate', 'Distal'] },
  { name: 'Middle', segments: ['Proximal', 'Intermediate', 'Distal'] },
  { name: 'Ring', segments: ['Proximal', 'Intermediate', 'Distal'] },
  { name: 'Little', segments: ['Proximal', 'Intermediate', 'Distal'] },
] as const;
const THUMB_SEGMENTS = ['ThumbMetacarpal', 'ThumbProximal', 'ThumbDistal'] as const;

/** 简化 T-pose 人形：只建手势用到的脊柱/头/双臂链 */
function makeRig(): {
  scene: THREE.Object3D;
  skeleton: ReturnType<typeof createVrmSkeleton>;
  bones: Map<string, NormalizedBoneRef>;
} {
  const scene = new THREE.Object3D();
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
  for (const side of ['left', 'right'] as const) {
    const sign = side === 'left' ? 1 : -1;
    add(`${side}Shoulder`, 'spine', [0.05 * sign, 0.2, 0]);
    add(`${side}UpperArm`, `${side}Shoulder`, [0.12 * sign, 0, 0]);
    add(`${side}LowerArm`, `${side}UpperArm`, [0.26 * sign, 0, 0]);
    add(`${side}Hand`, `${side}LowerArm`, [0.25 * sign, 0, 0]);
    add(`${side}UpperLeg`, 'spine', [0.12 * sign, -0.05, 0]);
    add(`${side}LowerLeg`, `${side}UpperLeg`, [0, -0.4, 0]);
    add(`${side}Foot`, `${side}LowerLeg`, [0, -0.4, 0]);
    // 手指链只用于验证局部屈曲，位置仅保证父子层级
    for (const finger of FINGERS) {
      let parent = `${side}Hand`;
      for (const segment of finger.segments) {
        const name = `${side}${finger.name}${segment}`;
        add(name, parent, [0.02 * sign, 0, 0]);
        parent = name;
      }
    }
    let thumbParent = `${side}Hand`;
    for (const segment of THUMB_SEGMENTS) {
      const name = `${side}${segment}`;
      add(name, thumbParent, [0.02 * sign, 0, 0.01]);
      thumbParent = name;
    }
  }
  const skeleton = createVrmSkeleton(bones);
  skeleton.capture();
  return { scene, skeleton, bones };
}

function run(id: string) {
  const rig = makeRig();
  POSE_EXECUTORS[id]?.(rig.skeleton, rig.bones, 1, 0);
  rig.scene.updateMatrixWorld(true);
  return rig;
}

function world(node: THREE.Object3D): Vec {
  return node.getWorldPosition(new THREE.Vector3());
}

function dirs(rig: ReturnType<typeof makeRig>) {
  const d = (a: string, b: string) => world(rig.bones.get(b)!.node).sub(world(rig.bones.get(a)!.node)).normalize();
  return {
    upperLeft: d('leftUpperArm', 'leftLowerArm'),
    lowerLeft: d('leftLowerArm', 'leftHand'),
    upperRight: d('rightUpperArm', 'rightLowerArm'),
    lowerRight: d('rightLowerArm', 'rightHand'),
    upperLegLeft: d('leftUpperLeg', 'leftLowerLeg'),
    lowerLegLeft: d('leftLowerLeg', 'leftFoot'),
  };
}

const hang = dirs(run('pose.arms-hang'));

describe('手势执行器：大臂只微调，主要变化在小臂', () => {
  it('切换动作时从上一手臂姿势直接交叉淡化，不经过 T-pose', () => {
    const rig = makeRig();
    const runtime = new VrmAnimationRuntime(rig.bones);
    runtime.captureBase();
    // 上一姿势：叉腰
    POSE_EXECUTORS['pose.hands-on-hips']!(runtime.skeleton, rig.bones, 1, 0);
    rig.scene.updateMatrixWorld(true);
    const before = dirs(rig);

    runtime.play('behavior.bow');
    runtime.captureFrame();
    runtime.update(16);
    rig.scene.updateMatrixWorld(true);
    const after = dirs(rig);
    const tPose = new THREE.Vector3(1, 0, 0); // 左臂 T-pose 方向
    // 头 16ms 仍应接近上一姿势（叉腰），而不是水平 T-pose
    expect(after.upperLeft.angleTo(before.upperLeft)).toBeLessThan(0.2);
    expect(after.upperLeft.angleTo(tPose)).toBeGreaterThan(0.7);
  });

  for (const id of ['pose.hands-on-hips', 'pose.chin-rest', 'pose.yawn', 'pose.hug']) {
    it(id, () => {
      const pose = dirs(run(id));
      const upper = Math.max(
        pose.upperLeft.angleTo(hang.upperLeft),
        pose.upperRight.angleTo(hang.upperRight),
      );
      const lower = Math.max(
        pose.lowerLeft.angleTo(hang.lowerLeft),
        pose.lowerRight.angleTo(hang.lowerRight),
      );
      // 大臂相对自然下垂不超过 40°，且小臂变化明显大于大臂
      expect(upper).toBeLessThan((40 * Math.PI) / 180);
      expect(lower).toBeGreaterThan(upper * 1.5);
    });
  }

  it('鞠躬双臂保持自然下垂', () => {
    const pose = dirs(run('pose.bow'));
    expect(pose.upperLeft.angleTo(hang.upperLeft)).toBeLessThan((20 * Math.PI) / 180);
    expect(pose.upperRight.angleTo(hang.upperRight)).toBeLessThan((20 * Math.PI) / 180);
  });

  it('被拎起时四肢前后左右都摆动，不是原地正步', () => {
    const rigAt = (time: number) => {
      const rig = makeRig();
      POSE_EXECUTORS['pose.lift-struggle']!(rig.skeleton, rig.bones, 1, time);
      rig.scene.updateMatrixWorld(true);
      return rig;
    };
    const rigs = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1.05, 1.2].map(rigAt);
    const range = (name: string, axis: 'x' | 'z') => {
      const values = rigs.map((rig) => world(rig.bones.get(name)!.node)[axis]);
      return Math.max(...values) - Math.min(...values);
    };
    for (const part of ['leftHand', 'rightHand', 'leftFoot', 'rightFoot']) {
      expect(range(part, 'x')).toBeGreaterThan(0.04);
      expect(range(part, 'z')).toBeGreaterThan(0.04);
    }
  });

  it('悬空时四指协调伸缩，拇指独立摆动', () => {
    const anglesAt = (time: number) => {
      const rig = makeRig();
      POSE_EXECUTORS['pose.lift-struggle']!(rig.skeleton, rig.bones, 1, time);
      const curl = (name: string) => {
        const q = rig.bones.get(name)!.node.quaternion;
        return 2 * Math.atan2(q.z, q.w);
      };
      return {
        four: ['Index', 'Middle', 'Ring', 'Little'].map((finger) => curl(`left${finger}Proximal`)),
        thumb: curl('leftThumbProximal'),
      };
    };
    const samples = Array.from({ length: 80 }, (_, i) => anglesAt(i * 0.025));
    const base = samples[0]!;
    for (const sample of samples) {
      // 四指共享同一包络，同一时刻屈曲角只差很小的相位
      expect(Math.max(...sample.four) - Math.min(...sample.four)).toBeLessThan(0.2);
    }
    const fourDelta = samples.map((sample) => sample.four.map((value, i) => value - base.four[i]!));
    const thumbDelta = samples.map((sample) => sample.thumb - base.thumb);
    expect(Math.max(...fourDelta.map((delta) => Math.abs(delta[0]!)))).toBeGreaterThan(0.1);
    expect(Math.max(...thumbDelta.map((delta) => Math.abs(delta)))).toBeGreaterThan(0.1);
    // 拇指与四指不同相：存在四指伸展而拇指收拢（或相反）的时点
    expect(samples.some((_, i) => fourDelta[i]![0]! * thumbDelta[i]! < 0)).toBe(true);
  });

  it('叉腰双手在腰侧，不藏到身后', () => {
    const rig = run('pose.hands-on-hips');
    const left = rig.bones.get('leftHand')!.node.getWorldPosition(new THREE.Vector3());
    const right = rig.bones.get('rightHand')!.node.getWorldPosition(new THREE.Vector3());
    expect(left.z).toBeGreaterThan(-0.02);
    expect(right.z).toBeGreaterThan(-0.02);
  });

  it('拥抱双手分开在胸前，而不是合掌', () => {
    const rig = run('pose.hug');
    const left = world(rig.bones.get('leftHand')!.node);
    const right = world(rig.bones.get('rightHand')!.node);
    expect(Math.abs(left.x - right.x)).toBeGreaterThan(0.15);
    expect(left.z).toBeGreaterThan(0.15);
    expect(right.z).toBeGreaterThan(0.15);
  });
});
