'use client';

import type { WbfmStageBridge } from '@wbfm/shared/stage';

/** 取桌面端注入的舞台桥；纯浏览器/SSR 为 null（截图/独立窗能力降级为不可用） */
export function getStageBridge(): WbfmStageBridge | null {
  if (typeof window === 'undefined') return null;
  return window.wbfm?.stage ?? null;
}

/** 全屏：桌面舞台窗走主进程原生全屏；浏览器用 Fullscreen API */
export async function toggleStageFullscreen(): Promise<void> {
  // 浏览器全屏 API 在已全屏的原生窗口里会互相打架，有桥时优先走桥
  const bridge = getStageBridge();
  if (bridge) {
    await bridge.toggleFullscreen().catch(() => false);
    return;
  }
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    /* 浏览器不允许时静默（多为用户手势/权限限制） */
  }
}
