'use client';

import * as React from 'react';
import { pulseReunionSignal, type Live2dController } from '@/features/avatar';

export interface UsePetPointerGazeOptions {
  controllerRef: React.MutableRefObject<Live2dController | null>;
  /** 情绪与短句总开关同时为真才允许发久别信号 */
  enabled: boolean;
}

/**
 * 全域视线跟随（拖拽盒遮挡 canvas 宿主，故在舞台根层归一化喂指针）；
 * 指针重新进入窗口 → 节流发一次久别信号（人回到桌宠前的「被重新关注」信号）。
 */
export function usePetPointerGaze({ controllerRef, enabled }: UsePetPointerGazeOptions): void {
  const lastPulseRef = React.useRef(0);

  React.useEffect(() => {
    let inside = false;
    const onMove = (event: PointerEvent) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (w > 0 && h > 0) {
        controllerRef.current?.setGaze(
          (event.clientX / w - 0.5) * 2,
          (event.clientY / h - 0.5) * 2,
        );
      }
      if (!inside) {
        inside = true;
        if (!enabled) return;
        const now = Date.now();
        if (now - lastPulseRef.current >= 30_000) {
          lastPulseRef.current = now;
          pulseReunionSignal(now);
        }
      }
    };
    const onLeave = () => {
      inside = false;
    };
    window.addEventListener('pointermove', onMove);
    document.documentElement.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('mouseleave', onLeave);
    };
  }, [controllerRef, enabled]);
}
