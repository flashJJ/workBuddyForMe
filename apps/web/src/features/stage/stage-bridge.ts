'use client';

import type { WbfmStageBridge } from '@wbfm/shared/stage';

/** 取桌面端注入的舞台桥；纯浏览器/SSR 为 null（截图/独立窗能力降级为不可用） */
export function getStageBridge(): WbfmStageBridge | null {
  if (typeof window === 'undefined') return null;
  return window.wbfm?.stage ?? null;
}
