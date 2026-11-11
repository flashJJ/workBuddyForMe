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
import { BEHAVIORS } from '../behaviors';
import { NORM_BONE_NAMES } from '../mask';

const SAMPLE_MS = [0, 120, 300, 600] as const;
/** 量化网格：1 / 0.02 */
const QUANT = 50;

function makeRuntime(): {
  runtime: VrmAnimationRuntime;
  bones: Map<string, NormalizedBoneRef>;
} {
  const scene = new THREE.Object3D();
  const bones = new Map<string, NormalizedBoneRef>();
  for (const name of NORM_BONE_NAMES) {
    const node = new THREE.Object3D();
    scene.add(node);
    bones.set(name, { name, node, baseQuat: new THREE.Quaternion() });
  }
  const runtime = new VrmAnimationRuntime(bones);
  runtime.captureBase();
  return { runtime, bones };
}

/** 采样顺序固定：root → 骨骼列表，保证摘要可复现 */
function values(runtime: VrmAnimationRuntime, bones: Map<string, NormalizedBoneRef>): number[] {
  const out = [runtime.root.y, runtime.root.yaw, runtime.root.roll];
  for (const name of NORM_BONE_NAMES) {
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
