'use client';

import type { WbfmPetBridge } from '@wbfm/shared';

/**
 * 桌宠桥访问与命中区纯函数（M4 伴身）。
 *
 * 穿透态下窗口 setIgnoreMouseEvents(true,{forward}) 仍转发 mousemove，
 * 但 pointer 事件命中在透明窗上不可靠，因此命中判定用「坐标 vs 命中盒」
 * 纯数学计算（与 pet-stage 的可视盒同一份常量），主进程滞回控制器据此翻转。
 */

/** 交互命中列：左右各留 15%、顶部留 11%（底部到窗底）。与 pet-stage 可视区域一致 */
export const PET_HIT = {
  left: 0.15,
  right: 0.85,
  top: 0.11,
  /** 身体拖拽区在命中列内的下 62%；其余上部为头部区（点击落到 Live2D 触发 tap） */
  bodyHeight: 0.62,
} as const;

/** 取桌面端注入的 pet 桥；纯浏览器/SSR 为 null */
export function getPetBridge(): WbfmPetBridge | null {
  if (typeof window === 'undefined') return null;
  return window.wbfm?.pet ?? null;
}

/**
 * 指针坐标是否落在角色可交互列内（含头部与身体）。
 * @param x clientX（CSS 像素）
 * @param y clientY
 * @param width 窗口 clientWidth
 * @param height 窗口 clientHeight
 */
export function isPetHitPoint(x: number, y: number, width: number, height: number): boolean {
  if (width <= 0 || height <= 0) return false;
  return (
    x >= width * PET_HIT.left &&
    x <= width * PET_HIT.right &&
    y >= height * PET_HIT.top &&
    y <= height
  );
}

/** 坐标是否落在身体拖拽盒（区别于头部 tap 区） */
export function isPetBodyPoint(x: number, y: number, width: number, height: number): boolean {
  if (!isPetHitPoint(x, y, width, height)) return false;
  return y >= height * (1 - PET_HIT.bodyHeight);
}

/** 从 /pet?model=xxx 读取模型 id；无 query 返回 null（交由注册表回落 haru） */
export function readPetModelId(): string | null {
  if (typeof window === 'undefined') return null;
  const id = new URLSearchParams(window.location.search).get('model');
  return typeof id === 'string' && id.length > 0 ? id : null;
}
