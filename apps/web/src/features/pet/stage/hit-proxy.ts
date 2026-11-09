'use client';

import * as React from 'react';
import {
  isPointInPetHitProxy,
  type PetHitProxy,
  type WbfmPetBridge,
} from '@wbfm/shared/pet';
import { isPetHitPoint } from '../pet-bridge';
import type { AvatarScreenRect } from '@/features/avatar';

/** 最近一次上报的轮廓：渲染层自身的 mousemove 悬停与主进程共用同一份 */
let latestProxy: PetHitProxy | null = null;

/** 由模型包围盒生成贴合站姿的命中轮廓（头窄-肩宽-脚窄，四角切掉透明区） */
export function buildPetHitProxy(
  rect: AvatarScreenRect,
  viewport: { width: number; height: number },
): PetHitProxy | null {
  if (!(rect.width > 0) || !(rect.height > 0)) return null;
  if (!(viewport.width > 0) || !(viewport.height > 0)) return null;
  const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
  const left = clamp01(rect.x / viewport.width);
  const right = clamp01((rect.x + rect.width) / viewport.width);
  const top = clamp01(rect.y / viewport.height);
  const bottom = clamp01((rect.y + rect.height) / viewport.height);
  const width = right - left;
  const height = bottom - top;
  if (width < 0.02 || height < 0.02) return null;
  const at = (fx: number, fy: number): [number, number] => [left + width * fx, top + height * fy];
  return {
    version: 1,
    polygons: [
      {
        id: 'body',
        points: [
          at(0.3, 0),
          at(0.7, 0),
          at(1, 0.08),
          at(1, 0.3),
          at(0.92, 0.46),
          at(0.88, 0.78),
          at(0.78, 1),
          at(0.22, 1),
          at(0.12, 0.78),
          at(0.08, 0.46),
          at(0, 0.3),
          at(0, 0.08),
        ],
      },
    ],
  };
}

/** 渲染层指针命中：有轮廓用轮廓，未上报回落固定矩形 */
export function isPetHitPointAt(x: number, y: number, width: number, height: number): boolean {
  if (width <= 0 || height <= 0) return false;
  if (latestProxy && latestProxy.polygons.length > 0) {
    return isPointInPetHitProxy(x / width, y / height, latestProxy);
  }
  return isPetHitPoint(x, y, width, height);
}

/**
 * 模型包围盒 → 归一化命中轮廓，去重后上报主进程。
 * 返回的 callback 直接挂到 AvatarCanvasRouter 的 onModelRect。
 */
export function usePetHitProxy(
  bridge: WbfmPetBridge | null,
): (rect: AvatarScreenRect | null) => void {
  const lastKeyRef = React.useRef('');
  return React.useCallback(
    (rect: AvatarScreenRect | null) => {
      if (!bridge) return;
      const proxy = rect
        ? buildPetHitProxy(rect, { width: window.innerWidth, height: window.innerHeight })
        : null;
      const key = proxy ? JSON.stringify(proxy) : 'null';
      if (key === lastKeyRef.current) return;
      lastKeyRef.current = key;
      latestProxy = proxy;
      bridge.reportHitProxy(proxy);
    },
    [bridge],
  );
}
