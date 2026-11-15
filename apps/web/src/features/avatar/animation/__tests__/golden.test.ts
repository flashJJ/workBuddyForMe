/**
 * M0c T1.9：golden 快照与冻结回归。
 *
 * 每个行为在 0/120/300/600ms 采样全部骨骼四元数与 root 偏移，
 * 量化到 0.02 网格后取摘要（等价容差 0.02），防止后续调参无意改变观感。
 */

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { NormalizedBoneRef } from '../../pose/bones';
import { VrmAnimationRuntime } from '../adapters/vrm';
import { POSE_EXECUTORS } from '../adapters/vrm-executors';
import { BEHAVIORS } from '../behaviors';
import { NORM_BONE_NAMES, BODY_BONE_NAMES } from '../mask';

const SAMPLE_MS = [0, 120, 300, 600] as const;
/** 量化网格：1 / 0.02 */
const QUANT = 50;

/** 简化人形 rest 骨架：世界方向执行器需要真实父子链与偏移 */
const REST_BONES: Readonly<
  Record<string, { parent: string | null; pos: [number, number, number] }>
> = {
  spine: { parent: null, pos: [0, 0.95, 0] },
  neck: { parent: 'spine', pos: [0, 0.3, 0] },
  head: { parent: 'neck', pos: [0, 0.1, 0] },
  leftShoulder: { parent: 'spine', pos: [0.05, 0.2, 0] },
  leftUpperArm: { parent: 'leftShoulder', pos: [0.12, 0, 0] },
  leftLowerArm: { parent: 'leftUpperArm', pos: [0.26, 0, 0] },
  leftHand: { parent: 'leftLowerArm', pos: [0.25, 0, 0] },
  rightShoulder: { parent: 'spine', pos: [-0.05, 0.2, 0] },
  rightUpperArm: { parent: 'rightShoulder', pos: [-0.12, 0, 0] },
  rightLowerArm: { parent: 'rightUpperArm', pos: [-0.26, 0, 0] },
  rightHand: { parent: 'rightLowerArm', pos: [-0.25, 0, 0] },
  leftUpperLeg: { parent: 'spine', pos: [0.12, -0.05, 0] },
  leftLowerLeg: { parent: 'leftUpperLeg', pos: [0, -0.4, 0] },
  leftFoot: { parent: 'leftLowerLeg', pos: [0, -0.4, 0] },
  rightUpperLeg: { parent: 'spine', pos: [-0.12, -0.05, 0] },
  rightLowerLeg: { parent: 'rightUpperLeg', pos: [0, -0.4, 0] },
  rightFoot: { parent: 'rightLowerLeg', pos: [0, -0.4, 0] },
};

function makeRuntime(): {
  runtime: VrmAnimationRuntime;
  bones: Map<string, NormalizedBoneRef>;
} {
  const scene = new THREE.Object3D();
  const nodes = new Map<string, THREE.Object3D>();
  const bones = new Map<string, NormalizedBoneRef>();
  for (const name of NORM_BONE_NAMES) {
    const rest = REST_BONES[name];
    const parentName =
      rest?.parent ?? (name.startsWith('left') ? 'leftHand' : name.startsWith('right') ? 'rightHand' : null);
    const parent = parentName ? nodes.get(parentName) : undefined;
    const node = new THREE.Object3D();
    if (rest) node.position.set(...rest.pos);
    (parent ?? scene).add(node);
    nodes.set(name, node);
    bones.set(name, { name, node, baseQuat: new THREE.Quaternion() });
  }
  const runtime = new VrmAnimationRuntime(bones);
  runtime.captureBase();
  return { runtime, bones };
}

/** 采样顺序固定：root → 身体骨骼（手指由程序化层写，不进运行时 golden） */
function values(runtime: VrmAnimationRuntime, bones: Map<string, NormalizedBoneRef>): number[] {
  const out = [runtime.root.y, runtime.root.yaw, runtime.root.roll];
  for (const name of BODY_BONE_NAMES) {
    const quaternion = bones.get(name)?.node.quaternion;
    if (quaternion) out.push(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
  }
  return out;
}

/** FNV-1a：量化后取摘要，快照文件保持可读 */
function digest(samples: number[]): string {
  let hash = 2166136261;
  for (const value of samples) {
    hash ^= Math.round(value * QUANT) >>> 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

describe('动效库 golden（量化容差 0.02）', () => {
  for (const behavior of BEHAVIORS) {
    it(behavior.id, () => {
      const { runtime, bones } = makeRuntime();
      // 行为切换从自然垂臂交叉淡化，避免 golden 在 t=0 记录 T/A-pose
      POSE_EXECUTORS['pose.arms-hang']?.(runtime.skeleton, bones, 1, 0);
      expect(runtime.play(behavior.id)).toBe(true);
      const frames: Record<string, string> = {};
      let elapsed = 0;
      for (const at of SAMPLE_MS) {
        // 与 VrmPoseLayer 每帧管线一致：先回绑定姿态再捕获帧快照
        runtime.captureFrame();
        runtime.update(at - elapsed);
        elapsed = at;
        frames[`t${at}`] = digest(values(runtime, bones));
      }
      expect(frames).toMatchSnapshot();
    });
  }

  it('dt = 0 冻结（hidden 档不推进）', () => {
    const { runtime, bones } = makeRuntime();
    runtime.play('behavior.lifted');
    runtime.captureFrame();
    runtime.update(200);
    const frozen = digest(values(runtime, bones));
    runtime.captureFrame();
    runtime.update(0);
    expect(digest(values(runtime, bones))).toBe(frozen);
  });
});
