import * as THREE from 'three';
import { computeAnimatedBounds } from './animated-bounds';

/** 取景自检结果（仅 dev 调试钩子使用） */
export interface VrmFitResult {
  scale: number;
  fitsX: boolean;
  fitsY: boolean;
}

/**
 * 取景：让模型（含整个动作池的摆幅）完整落在视锥内（由 VrmCanvas 外迁）。
 *
 * @param bounds 整个动作池的包围盒并集（由 controller.primeForFit 采样得到，未缩放）。
 *   不传则现场测当前帧包围盒——那样只对静止模型可靠，有大幅待机动作时会裁到四肢。
 *
 * 本函数必须幂等（容器尺寸变化时会重复调用）：先把 scale/position 归零再测量；
 * 且对齐与相机定位全部基于传入的 bounds 推导，不依赖「当前帧」的姿态，避免抖动。
 */
export function fitVrmToCamera(
  vrm: import('@pixiv/three-vrm').VRM,
  camera: THREE.PerspectiveCamera,
  host: HTMLElement,
  bounds?: { min: THREE.Vector3; max: THREE.Vector3 } | null,
): VrmFitResult | null {
  vrm.scene.scale.set(1, 1, 1);
  vrm.scene.position.set(0, 0, 0);
  vrm.scene.updateMatrixWorld(true);

  const box = bounds
    ? new THREE.Box3(bounds.min.clone(), bounds.max.clone())
    : computeAnimatedBounds(vrm.scene);
  const modelWidth = box.max.x - box.min.x;
  const modelHeight = box.max.y - box.min.y;
  if (!(modelWidth > 0) || !(modelHeight > 0)) return null;

  const hostH = host.offsetHeight || host.clientHeight || 400;
  const hostW = host.offsetWidth || host.clientWidth || 300;
  const aspect = hostW / hostH;
  const fovRad = (camera.fov * Math.PI) / 180;
  const DIST = 3.0;
  const visibleH = 2 * Math.tan(fovRad / 2) * DIST;
  const visibleW = visibleH * aspect;

  // 8% padding：动画采样到的边界本身是极值，留少量余量吸收 springbone 抖动
  const PAD = 0.08;
  const scale = Math.min(
    (visibleH * (1 - PAD * 2)) / modelHeight,
    (visibleW * (1 - PAD * 2)) / modelWidth,
  );
  vrm.scene.scale.set(scale, scale, scale);

  // 对齐：用 bounds 推导（scale 后 position 归零，故世界盒 = bounds × scale）
  const centerX = ((box.min.x + box.max.x) / 2) * scale;
  const bottomY = box.min.y * scale;
  const topY = box.max.y * scale;
  vrm.scene.position.set(-centerX, -bottomY, 0);

  // 相机对准模型竖直正中，保证上下都不出视锥
  const lookY = (bottomY + topY) / 2 - bottomY; // = 相对地面后的模型中心
  camera.position.set(0, lookY, 0 + DIST);
  camera.lookAt(0, lookY, 0);
  camera.updateProjectionMatrix();

  const frustumBottom = lookY - visibleH / 2;
  const frustumTop = lookY + visibleH / 2;
  const modelTop = topY - bottomY; // 贴地后模型顶端高度
  const modelHalfW = (modelWidth * scale) / 2;
  return {
    scale,
    fitsY: frustumBottom <= 0 && modelTop <= frustumTop,
    fitsX: modelHalfW <= visibleW / 2,
  };
}
