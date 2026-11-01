/**
 * v1.7 fx 内置注册表（零三方粒子库）。
 *
 * 仅纯数据与工具：DOM/CSS 动画由 EventFxLayer 按 id 渲染，
 * 时长同时是 EventPlayer 自动摘除效果的权威口径。
 */
import type { EventFxId } from '@wbfm/shared/schemas';

/** 各 fx 的存活时长（ms）：到期自动从层上摘除，不依赖 CSS animationend */
export const EVENT_FX_DURATION_MS: Record<EventFxId, number> = {
  hearts: 1600,
  sweat: 1200,
  sparkle: 1400,
  fadeIn: 600,
};

/** 层上的一个活动效果实例（key 唯一，同类连发不互相吞动画） */
export interface ActiveFx {
  id: EventFxId;
  key: number;
}

/** gaze 归一化坐标防御性钳制（schema 已锁 -1..1，播放器边界再兜底一次） */
export function clampGaze(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(-1, value));
}
