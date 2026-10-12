'use client';

import * as React from 'react';
import { pulseReunionSignal } from './reunion-storage';

/** 连续回前台事件的最小信号间隔（ms），避免频繁写 localStorage */
const SIGNAL_THROTTLE_MS = 30_000;

/**
 * v1.6 G6：主窗回到前台/重新可见时给桌宠窗发一次跨窗口信号，
 * 由桌宠侧的久别迎接判定决定是否打招呼（本 hook 不做任何判定）。
 */
export function useReunionForegroundSignal(): void {
  React.useEffect(() => {
    let lastSignal = 0;
    const fire = (): void => {
      const now = Date.now();
      if (now - lastSignal < SIGNAL_THROTTLE_MS) return;
      lastSignal = now;
      pulseReunionSignal(now);
    };
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') fire();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', fire);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', fire);
    };
  }, []);
}

/** Server Component 布局里挂载用的 client host（无 UI） */
export function ReunionSignalHost() {
  useReunionForegroundSignal();
  return null;
}
