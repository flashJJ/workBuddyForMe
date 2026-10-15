'use client';

import { StageRoot } from '@/features/stage/stage-root';

/**
 * /stage：全屏舞台独立路由（不进 (main) 布局，无侧栏）。
 * M1 用 mock cast 可演；M2 起经 query（?run= / ?meeting=）接真实数据源。
 * 裸浏览器可访问（截图/独立窗能力降级提示）；Electron 由主进程舞台窗承载。
 */
export default function StagePage() {
  return <StageRoot />;
}
