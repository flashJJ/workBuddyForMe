import * as THREE from 'three';

/**
 * 蒙皮网格包围盒工具（VrmController.primeForFit 与 fitVrmToCamera 共用）。
 *
 * ⚠️ three.js 的 `Box3.setFromObject` 对 Mesh/SkinnedMesh **只在 `boundingBox === null`
 * 时才调用 `computeBoundingBox()`**，否则直接复用缓存。因此「按当前姿态重新测量」
 * 之前必须先把缓存置空——否则逐帧采样拿到的永远是第一次测出来的旧姿态盒
 * （表现：动画摆幅大的帧会算出错误的取景 scale，四肢被裁）。
 */

/** 置空所有网格的包围盒缓存，迫使下一次 Box3.setFromObject 按当前姿态重算 */
export function invalidateMeshBounds(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh & { boundingBox?: THREE.Box3 | null };
    if (mesh.isMesh) mesh.boundingBox = null;
  });
}

/** 按当前姿态计算整个子树的世界包围盒（内部已失效缓存） */
export function computeAnimatedBounds(root: THREE.Object3D): THREE.Box3 {
  invalidateMeshBounds(root);
  root.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(root);
}
