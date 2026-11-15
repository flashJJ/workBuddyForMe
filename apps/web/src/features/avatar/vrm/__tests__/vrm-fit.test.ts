import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { fitVrmToCamera } from '../vrm-fit';

const BOUNDS = {
  min: new THREE.Vector3(-0.3, 0, 0),
  max: new THREE.Vector3(0.3, 1.6, 0),
};

function host(width: number, height: number): HTMLElement {
  return { offsetWidth: width, offsetHeight: height, clientWidth: width, clientHeight: height } as HTMLElement;
}

function vrmStub(): Parameters<typeof fitVrmToCamera>[0] {
  return { scene: new THREE.Group() } as unknown as Parameters<typeof fitVrmToCamera>[0];
}

const VISIBLE_H = 2 * Math.tan(((30 * Math.PI) / 180) / 2) * 3;

describe('fitVrmToCamera 桌宠取景', () => {
  it('大档放大后仍保留头顶 10% 余量，脚底贴底', () => {
    const camera = new THREE.PerspectiveCamera(30, 260 / 400, 0.1, 100);
    const result = fitVrmToCamera(vrmStub(), camera, host(260, 400), BOUNDS, 1.2, {
      bottomAlign: true,
      topHeadroom: 0.1,
    });
    expect(result?.fitsY).toBe(true);
    expect(result?.fitsX).toBe(true);
    const modelTop = BOUNDS.max.y * (result?.scale ?? 0);
    expect(VISIBLE_H - modelTop).toBeGreaterThanOrEqual(VISIBLE_H * 0.1 - 1e-6);
    // bottomAlign：视锥底 = 0
    expect(camera.position.y - VISIBLE_H / 2).toBeCloseTo(0, 6);
  });

  it('主窗未传桌宠选项时保持竖直居中', () => {
    const camera = new THREE.PerspectiveCamera(30, 260 / 400, 0.1, 100);
    const result = fitVrmToCamera(vrmStub(), camera, host(260, 400), BOUNDS, 1);
    const modelTop = BOUNDS.max.y * (result?.scale ?? 0);
    expect(camera.position.y).toBeCloseTo(modelTop / 2, 6);
  });
});
