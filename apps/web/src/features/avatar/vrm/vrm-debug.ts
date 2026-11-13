'use client';

import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import type { VrmController } from './vrm-controller';
import type { VrmFitResult } from './vrm-fit';
import { setBehaviorDebugSource } from '../animation/observability';

/** GPU 资源计数（换模型后应回到基线） */
export interface VrmResourceSnapshot {
  geometries: number;
  textures: number;
  programs: number;
}

/** dev 调试钩子（window.__vrmDebug）暴露的形状 */
export interface VrmDebugProbe {
  three: typeof THREE;
  vrm: VRM;
  camera: THREE.PerspectiveCamera;
  controller: VrmController;
  pool: THREE.AnimationClip[];
  fit: VrmFitResult | null;
  /** P4-2：renderer.info 快照，用于换模型/卸载后的回收审计 */
  resources: () => VrmResourceSnapshot;
  state: () => Record<string, unknown>;
}

/** 仅 dev：安装 MCP/CDP 可读的运行时探针；生产环境返回 null */
export function installVrmDebugProbe(
  vrm: VRM,
  camera: THREE.PerspectiveCamera,
  controller: VrmController,
  pool: THREE.AnimationClip[],
  host: HTMLElement,
  getResources?: () => VrmResourceSnapshot,
): VrmDebugProbe | null {
  if (process.env.NODE_ENV === 'production') return null;
  const probe: VrmDebugProbe = {
    three: THREE,
    vrm,
    camera,
    controller,
    pool,
    fit: null,
    resources: getResources ?? (() => ({ geometries: 0, textures: 0, programs: 0 })),
    state: () => ({
      scale: vrm.scene.scale.toArray(),
      pos: vrm.scene.position.toArray(),
      cam: camera.position.toArray(),
      host: [host.offsetWidth, host.offsetHeight],
      phase: (controller as any)?.interaction?.currentPhase ?? null,
      idle: (controller as any)?.mixer?.idleClipName ?? null,
      poolSize: (controller as any)?.mixer?.poolSize ?? 0,
      gesture: Boolean((controller as any)?.mixer?.hasGesture),
      holding: Boolean((controller as any)?.mixer?.isHolding),
      clip: (controller as any)?.mixer?.currentClipName ?? null,
      props: (controller as any)?.props?.debug ?? null,
      frames: (controller as any)?.frameDebug ?? null,
    }),
  };
  (window as unknown as Record<string, unknown>).__vrmDebug = probe;
  // T1.8：__petDebug.behaviors 的数据源（预览面板复用同一快照）
  setBehaviorDebugSource(() => (controller as any)?.pose?.behaviorDebug ?? null);
  return probe;
}

export function removeVrmDebugProbe(probe: VrmDebugProbe | null): void {
  if (!probe) return;
  const host = window as unknown as Record<string, unknown>;
  if (host.__vrmDebug === probe) {
    delete host.__vrmDebug;
    setBehaviorDebugSource(null);
  }
}
