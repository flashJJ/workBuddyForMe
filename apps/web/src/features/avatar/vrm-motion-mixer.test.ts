import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { MotionMixer } from './vrm-motion-mixer';
import type { MotionPoolEntry } from './motion-segments';

/**
 * 无头 mixer 段调度测试：three 的 AnimationMixer 只操作 Object3D，不需要 WebGL，
 * 因此可在 node 环境直接验证 A → B → C 的播放时序与缺段退化。
 */
function fakeVrm(): VRM {
  return {
    scene: new THREE.Object3D(),
    humanoid: null,
    update: () => {},
  } as unknown as VRM;
}

function poolEntry(
  clip: THREE.AnimationClip,
  segment: MotionPoolEntry['segment'],
  entryKey: string | null,
): MotionPoolEntry {
  return { clip, name: clip.name, segment, entryKey, mood: 'normal', minRelationshipLevel: null };
}

describe('MotionMixer 长按三段式调度', () => {
  it('A 播完自动进 B（循环维持），松手播 C，C 播完回待机', () => {
    const a = new THREE.AnimationClip('A', 1, []);
    const b = new THREE.AnimationClip('B', 1, []);
    const c = new THREE.AnimationClip('C', 1, []);
    const mixer = new MotionMixer(
      fakeVrm(),
      [],
      [poolEntry(a, 'a_start', 'wave'), poolEntry(b, 'b_loop', 'wave'), poolEntry(c, 'c_end', 'wave')],
      null,
    );

    // 初始待机 = 条目的循环段 B
    expect(mixer.idleClipName).toBe('B');

    expect(mixer.beginHoldMotion(() => 0)).toBe(true);
    expect(mixer.currentClipName).toBe('A');
    expect(mixer.isHolding).toBe(true);

    mixer.update(1); // A 播完 → 进 B 段
    expect(mixer.currentClipName).toBe('B');
    expect(mixer.isHolding).toBe(true);

    mixer.endHoldMotion(); // 松手 → C 段
    expect(mixer.currentClipName).toBe('C');

    mixer.update(1); // C 播完 → 回待机
    expect(mixer.isHolding).toBe(false);
    expect(mixer.currentClipName).toBe('B');
  });

  it('只有 single 的条目：长按直接循环维持，松手直接回待机（缺 A / 缺 C 退化）', () => {
    const s = new THREE.AnimationClip('S', 1, []);
    const mixer = new MotionMixer(fakeVrm(), [], [poolEntry(s, 'single', null)], null);
    expect(mixer.idleClipName).toBe('S');

    expect(mixer.beginHoldMotion(() => 0)).toBe(true);
    expect(mixer.currentClipName).toBe('S');
    expect(mixer.isHolding).toBe(true);

    mixer.endHoldMotion();
    expect(mixer.isHolding).toBe(false);
    expect(mixer.currentClipName).toBe('S');
  });

  it('长按期间不轮播待机动作', () => {
    const a = new THREE.AnimationClip('A', 1, []);
    const b = new THREE.AnimationClip('B', 1, []);
    const c = new THREE.AnimationClip('C', 1, []);
    const d = new THREE.AnimationClip('D', 1, []);
    const mixer = new MotionMixer(
      fakeVrm(),
      [],
      [
        poolEntry(a, 'a_start', 'wave'),
        poolEntry(b, 'b_loop', 'wave'),
        poolEntry(c, 'c_end', 'wave'),
        poolEntry(d, 'single', null),
      ],
      { enabled: true, seconds: 1 },
    );

    mixer.beginHoldMotion(() => 0);
    mixer.tickRotation(5); // 超过间隔也应被长按挡住
    expect(mixer.currentClipName).toBe('A');
  });
});
