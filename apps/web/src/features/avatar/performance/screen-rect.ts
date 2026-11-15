import * as THREE from 'three';

/** 模型在容器内的屏幕包围盒（CSS 像素，原点容器左上） */
export interface AvatarScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const box = new THREE.Box3();
const corner = new THREE.Vector3();

/**
 * 把对象包围盒的 8 个角投影到相机视口，取屏幕矩形（命中轮廓输入）。
 * 只在加载/尺寸变化时调用一次，不进入每帧循环。
 */
export function projectObjectToViewport(
  object: THREE.Object3D,
  camera: THREE.Camera,
  width: number,
  height: number,
): AvatarScreenRect | null {
  if (!(width > 0) || !(height > 0)) return null;
  object.updateMatrixWorld(true);
  box.setFromObject(object);
  if (box.isEmpty()) return null;
  camera.updateMatrixWorld();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < 8; i++) {
    corner
      .set(
        i & 1 ? box.max.x : box.min.x,
        i & 2 ? box.max.y : box.min.y,
        i & 4 ? box.max.z : box.min.z,
      )
      .project(camera);
    const px = ((corner.x + 1) / 2) * width;
    const py = ((1 - corner.y) / 2) * height;
    minX = Math.min(minX, px);
    minY = Math.min(minY, py);
    maxX = Math.max(maxX, px);
    maxY = Math.max(maxY, py);
  }
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
