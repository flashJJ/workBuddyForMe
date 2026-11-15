import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  GAZE_LIMITS,
  GAZE_SMOOTH,
  gazeAngles,
  normalizeGaze,
  rigPitchSign,
  smoothDamp,
} from './gaze';

const DEG = Math.PI / 180;

describe('VRM 视线参数', () => {
  it('满偏指针映射到头部 26°/16°、脊柱 8°', () => {
    const right = gazeAngles(1, 0);
    expect(right.headYaw).toBeCloseTo(26 * DEG, 6);
    expect(right.spineYaw).toBeCloseTo(8 * DEG, 6);
    expect(right.headPitch).toBeCloseTo(0, 6);

    // 屏幕向下 → 低头（正值）；姿态层按 rig 标定旋转方向
    const down = gazeAngles(0, 1);
    expect(down.headPitch).toBeCloseTo(16 * DEG, 6);
    // 屏幕向上 → 抬头
    const up = gazeAngles(0, -1);
    expect(up.headPitch).toBeCloseTo(-16 * DEG, 6);
  });

  it('越界输入夹紧，weight 线性缩放', () => {
    expect(gazeAngles(9, -9)).toEqual(gazeAngles(1, -1));
    const half = gazeAngles(1, 1, 0.5);
    expect(half.headYaw).toBeCloseTo((26 * DEG) / 2, 6);
    expect(half.headPitch).toBeCloseTo((16 * DEG) / 2, 6);
    expect(gazeAngles(1, 1, 0)).toEqual({ headYaw: 0, headPitch: 0, spineYaw: 0 });
    expect(normalizeGaze(2, -2)).toEqual([1, -1]);
  });

  it('俯仰符号按头部世界 X 轴标定：VRM0（场景转 π）为 -1，VRM1（不转）为 +1', () => {
    const vrm1 = new THREE.Object3D();
    expect(rigPitchSign(vrm1)).toBe(1);

    const scene = new THREE.Object3D();
    scene.rotation.y = Math.PI;
    const head = new THREE.Object3D();
    scene.add(head);
    expect(rigPitchSign(head)).toBe(-1);
  });

  it('平滑与帧率无关：60fps 两帧 ≈ 30fps 一帧', () => {
    const at60 = smoothDamp(smoothDamp(0, 1, GAZE_SMOOTH.head, 1 / 60), 1, GAZE_SMOOTH.head, 1 / 60);
    const at30 = smoothDamp(0, 1, GAZE_SMOOTH.head, 1 / 30);
    expect(at60).toBeCloseTo(at30, 6);
  });

  it('非法 dt/lambda 保持当前值，不产生 NaN', () => {
    expect(smoothDamp(0.3, 1, GAZE_SMOOTH.head, 0)).toBe(0.3);
    expect(smoothDamp(0.3, 1, 0, 0.016)).toBe(0.3);
    expect(GAZE_LIMITS.headYawDeg).toBe(26);
  });
});
