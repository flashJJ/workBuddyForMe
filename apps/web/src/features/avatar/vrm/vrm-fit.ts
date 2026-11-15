import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { computeAnimatedBounds } from '../ui/animated-bounds';

/** 取景自检结果（仅 dev 调试钩子使用） */
export interface VrmFitResult {
  scale: number;
  fitsX: boolean;
  fitsY: boolean;
}

export interface VrmFitOptions {
  /** 脚底贴底对齐，竖直余量全部留在头顶（桌宠） */
  bottomAlign?: boolean;
  /** 头顶必须保留的视口比例（0..0.3），用于被拎起时不裁头 */
  topHeadroom?: number;
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
  scaleFactor = 1,
  options?: VrmFitOptions,
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
  const base = Math.min(
    (visibleH * (1 - PAD * 2)) / modelHeight,
    (visibleW * (1 - PAD * 2)) / modelWidth,
  );
  // 桌宠大档会放大到轻微超出视口；用顶部余量上限兜住，保证拎起时头不裁切
  const headroom = Math.max(0, Math.min(0.3, options?.topHeadroom ?? 0));
  const cap = (visibleH * (1 - headroom)) / modelHeight;
  const scale = Math.min(base * (scaleFactor > 0 ? scaleFactor : 1), cap);
  vrm.scene.scale.set(scale, scale, scale);

  // 对齐：用 bounds 推导（scale 后 position 归零，故世界盒 = bounds × scale）
  const centerX = ((box.min.x + box.max.x) / 2) * scale;
  const bottomY = box.min.y * scale;
  const topY = box.max.y * scale;
  vrm.scene.position.set(-centerX, -bottomY, 0);

  // 相机对准模型：桌宠脚底贴底、余量全留头顶；主窗保持竖直居中
  const lookY = options?.bottomAlign ? visibleH / 2 : (topY - bottomY) / 2;
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

/** 桌宠大小 → 取景比例（md 为原尺寸） */
export const PET_SIZE_SCALE: Record<'sm' | 'md' | 'lg', number> = { sm: 0.8, md: 1, lg: 1.2 };

/** 取景所需的最小控制器表面（避免与 VrmController 直接耦合） */
export interface CanvasFitTarget {
  primeForFit(): { min: THREE.Vector3; max: THREE.Vector3 } | null;
  captureBaseScale(): void;
}

export interface CanvasFitDeps {
  host: HTMLElement;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  getVrm: () => VRM | null;
  getController: () => CanvasFitTarget | null;
  getPetSize: () => 'sm' | 'md' | 'lg';
  /** 桌宠路由：脚底贴底 + 头顶余量；主窗保持居中 */
  isPet?: () => boolean;
  onFit: (width: number, height: number, result: VrmFitResult | null) => void;
}

/**
 * 画布尺寸 → 渲染器 / 相机 / 取景。
 *
 * 首次取景用整个动作池的包围盒并集（primeForFit），之后容器尺寸或桌宠大小变化才重算；
 * 比例变化不改变容器尺寸，所以单独暴露 `refit()` 供设置切换时调用。
 */
export function createCanvasFit(deps: CanvasFitDeps) {
  let disposed = false;
  let fitted = false;
  let lastW = 0;
  let lastH = 0;
  let fitW = 0;
  let fitH = 0;
  let fitFactor = 0;
  let bounds: { min: THREE.Vector3; max: THREE.Vector3 } | null = null;

  const apply = (w: number, h: number) => {
    const vrm = deps.getVrm();
    const controller = deps.getController();
    if (!vrm || !controller) return;
    if (!fitted) {
      bounds = controller.primeForFit();
      fitted = true;
    }
    fitFactor = PET_SIZE_SCALE[deps.getPetSize()];
    fitW = w;
    fitH = h;
    const pet = deps.isPet?.() ?? false;
    const result = fitVrmToCamera(vrm, deps.camera, deps.host, bounds, fitFactor, pet ? { bottomAlign: true, topHeadroom: 0.1 } : undefined);
    deps.onFit(w, h, result);
  };

  const resize = () => {
    requestAnimationFrame(() => {
      if (disposed) return;
      const w = deps.host.offsetWidth || deps.host.clientWidth;
      const h = deps.host.offsetHeight || deps.host.clientHeight;
      if (!w || !h) return;
      if (w === lastW && h === lastH) return;
      lastW = w;
      lastH = h;
      deps.renderer.setSize(w, h, false);
      const el = deps.renderer.domElement;
      el.style.width = w + 'px';
      el.style.height = h + 'px';
      el.style.display = 'block';
      deps.camera.aspect = w / h;
      deps.camera.updateProjectionMatrix();
      const sizeChanged = Math.abs(w - fitW) > 2 || Math.abs(h - fitH) > 2;
      if (!fitted || sizeChanged || fitFactor !== PET_SIZE_SCALE[deps.getPetSize()]) {
        apply(w, h);
      }
    });
  };

  const refit = () => {
    const w = deps.host.offsetWidth || deps.host.clientWidth;
    const h = deps.host.offsetHeight || deps.host.clientHeight;
    if (w && h) apply(w, h);
  };

  /**
   * 换模型后重置取景缓存：清掉 bounds 与首帧标记，下一次 apply 会重新
   * primeForFit。保留 lastW/lastH，避免 ResizeObserver 的尺寸短路跳过一次取景。
   */
  const reset = () => {
    fitted = false;
    bounds = null;
    fitW = 0;
    fitH = 0;
  };

  const dispose = () => {
    disposed = true;
  };

  return { resize, refit, reset, dispose };
}
