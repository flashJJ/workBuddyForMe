/**
 * v3.0 P0 帧率三档：交互 60 / 待机 30 / 不可见 0。
 *
 * 桌宠常驻桌面，60fps 全程渲染会持续占用 GPU/主线程；用 rAF 跳帧而不是
 * setInterval（与显示器刷新同步，避免抖动），隐藏时由渲染层主动停 ticker。
 */

export type FrameMode = 'hidden' | 'idle' | 'interact';

/** 目标帧间隔（ms）；hidden 为 0 表示不渲染 */
export const FRAME_INTERVAL_BY_MODE: Record<FrameMode, number> = {
  hidden: 0,
  idle: 1000 / 30,
  interact: 1000 / 60,
};

/** 档位对应帧率（PIXI ticker/FPS 控制器用；0 = 暂停） */
export function frameRateForMode(mode: FrameMode): number {
  if (mode === 'hidden') return 0;
  return mode === 'interact' ? 60 : 30;
}

/**
 * 本帧是否应渲染：按档位累加跳帧。
 * - 1ms 容差：60Hz 屏 rAF 时间戳约 16.6ms，略小于 1000/60；
 * - lastRenderAt <= 0（首帧）直接放行，避免开场多等一帧。
 */
export function shouldRenderFrame(now: number, lastRenderAt: number, mode: FrameMode): boolean {
  const interval = FRAME_INTERVAL_BY_MODE[mode];
  if (interval <= 0) return false;
  if (lastRenderAt <= 0) return true;
  return now - lastRenderAt >= interval - 1;
}
