import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { applyChibi, CHIBI_HEAD_SCALE, CHIBI_LEG_SCALE } from './apply-chibi';

function makeVrm(headScale = 1) {
  const head = new THREE.Object3D();
  head.scale.setScalar(headScale);
  const leftUpperLeg = new THREE.Object3D();
  const rightUpperLeg = new THREE.Object3D();
  const bones: Record<string, THREE.Object3D> = { head, leftUpperLeg, rightUpperLeg };
  const vrm = {
    scene: new THREE.Object3D(),
    humanoid: { getRawBoneNode: (name: string) => bones[name] ?? null },
  } as unknown as VRM;
  return { vrm, head, leftUpperLeg, rightUpperLeg };
}

describe('applyChibi', () => {
  it('开启：头放大、两条大腿缩短', () => {
    const { vrm, head, leftUpperLeg, rightUpperLeg } = makeVrm();
    applyChibi(vrm, true);
    expect(head.scale.x).toBeCloseTo(CHIBI_HEAD_SCALE);
    expect(leftUpperLeg.scale.x).toBeCloseTo(CHIBI_LEG_SCALE);
    expect(rightUpperLeg.scale.x).toBeCloseTo(CHIBI_LEG_SCALE);
  });

  it('重复开启不叠加', () => {
    const { vrm, head, leftUpperLeg } = makeVrm();
    applyChibi(vrm, true);
    applyChibi(vrm, true);
    expect(head.scale.x).toBeCloseTo(CHIBI_HEAD_SCALE);
    expect(leftUpperLeg.scale.x).toBeCloseTo(CHIBI_LEG_SCALE);
  });

  it('关闭：还原到原始缩放（含非 1 的原始值）', () => {
    const { vrm, head, leftUpperLeg, rightUpperLeg } = makeVrm(1.1);
    applyChibi(vrm, true);
    expect(head.scale.x).toBeCloseTo(1.1 * CHIBI_HEAD_SCALE);
    applyChibi(vrm, false);
    expect(head.scale.x).toBeCloseTo(1.1);
    expect(leftUpperLeg.scale.x).toBeCloseTo(1);
    expect(rightUpperLeg.scale.x).toBeCloseTo(1);
  });

  it('缺少 humanoid / 骨骼时安全跳过', () => {
    expect(() => applyChibi({ scene: new THREE.Object3D() } as unknown as VRM, true)).not.toThrow();
  });
});
