import type { Object3D } from 'three';

/**
 * 模型释放：换模型 / 卸载的唯一出口。
 *
 * 顺序固定（不可调换）：
 * 1. controller.dispose() —— 先停 mixer 与时钟，避免释放中的骨骼仍被写；
 * 2. removeProbe() —— 调试探针还持有 vrm/controller 引用；
 * 3. scene.remove(vrm.scene) —— 先摘场景，避免渲染一帧已释放资源；
 * 4. deepDispose(vrm.scene) —— 释放几何/纹理/材质，renderer 资源计数才会回落。
 *
 * 任一步抛错都不阻断后续步骤（否则会真漏显存）；只依赖最小表面，便于单测断言顺序。
 */
export interface ReleaseTarget {
  controller: { dispose(): void } | null;
  vrm: { scene: Object3D } | null;
  probe: unknown;
  scene: { remove(object: Object3D): unknown };
  /** 由调用方注入（默认 VRMUtils.deepDispose / removeVrmDebugProbe） */
  hooks: {
    removeProbe(probe: unknown): void;
    deepDispose(scene: Object3D): void;
  };
  /** 内部幂等标记；同一 target 二次释放直接返回 */
  released?: boolean;
}

function attempt(step: () => void, label: string): void {
  try {
    step();
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.warn(`[vrm] 释放失败: ${label}`, err);
  }
}

export function releaseVrmModel(target: ReleaseTarget | null): void {
  if (!target || target.released) return;
  target.released = true;

  attempt(() => target.controller?.dispose(), 'controller');
  attempt(() => target.hooks.removeProbe(target.probe), 'probe');
  const root = target.vrm?.scene;
  if (!root) return;
  attempt(() => target.scene.remove(root), 'remove');
  attempt(() => target.hooks.deepDispose(root), 'deepDispose');
}
