/**
 * v3.1 M3：动效内容快照注入。
 *
 * 默认快照必须与内置注册表同源；注入自有内容后，运行时只看到注入项。
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { NormalizedBoneRef } from '../../../pose/bones';
import { DEFAULT_MOTION_CONTENT, type MotionContent } from '../../content';
import { BEHAVIORS } from '../../behaviors';
import { MOTIONS } from '../../motions';
import { POSES } from '../../poses';
import { VrmAnimationRuntime } from '../../adapters/vrm';

describe('动效内容快照（v3.1）', () => {
  it('默认快照直接引用内置注册表', () => {
    expect(DEFAULT_MOTION_CONTENT.version).toBe('builtin');
    expect(DEFAULT_MOTION_CONTENT.poses).toBe(POSES);
    expect(DEFAULT_MOTION_CONTENT.motions).toBe(MOTIONS);
    expect(DEFAULT_MOTION_CONTENT.behaviors).toBe(BEHAVIORS);
  });

  it('注入单姿势内容后可播放，旧内容不可见', () => {
    const node = new THREE.Object3D();
    const bones = new Map<string, NormalizedBoneRef>([
      ['head', { name: 'head', node, baseQuat: new THREE.Quaternion() }],
    ]);
    const content: MotionContent = {
      version: 'test-1',
      poses: [{ id: 'pose.custom', mask: { include: ['head'] }, bones: { head: { x: 0.4 } } }],
      motions: [],
      behaviors: [],
    };
    const runtime = new VrmAnimationRuntime(bones, content);
    runtime.captureBase();

    expect(runtime.poses.get('pose.custom')).toBeDefined();
    expect(runtime.poses.get('pose.idle-body')).toBeUndefined();
    expect(runtime.motions.has('motion.wave')).toBe(false);
    expect(runtime.play('behavior.idle')).toBe(false);

    expect(runtime.applyPose('pose.custom', 1)).toBe(1);
    expect(node.quaternion.x).not.toBe(0);
  });
});
