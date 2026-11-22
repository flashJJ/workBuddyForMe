'use client';

import * as React from 'react';
import {
  buildOffsets,
  computeVirtualWindow,
  initialWindowRows,
  type VirtualWindow,
} from './windowing';

interface Params {
  active: boolean;
  count: number;
  itemKey: (index: number) => string;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

interface VirtualWindowState {
  window: VirtualWindow;
  measure: (key: string, height: number) => void;
}

/**
 * v4.20：按测量高度做窗口化。未测量的消息用估算高度占位；
 * 只有 active 时监听滚动与尺寸，非虚拟化模式不产生额外副作用。
 */
export function useVirtualWindow({ active, count, itemKey, containerRef }: Params): VirtualWindowState {
  const [heights, setHeights] = React.useState<Record<string, number>>({});
  const [viewport, setViewport] = React.useState(600);
  const [scrollTop, setScrollTop] = React.useState(0);
  const [initialized, setInitialized] = React.useState(false);

  const offsets = React.useMemo(
    () =>
      buildOffsets(
        Array.from({ length: count }, (_, index) => heights[itemKey(index)]),
      ),
    [count, heights, itemKey],
  );

  React.useEffect(() => {
    if (!active) {
      setInitialized(false);
      return;
    }
    const el = containerRef.current;
    if (!el) return;
    const syncViewport = () => setViewport(el.clientHeight || 600);
    syncViewport();
    const onScroll = () => {
      setScrollTop(el.scrollTop);
      setInitialized(true);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(syncViewport);
      observer.observe(el);
    }
    // 首次进入虚拟化：直接定位到底部，避免从顶部闪一帧
    const frame = requestAnimationFrame(() => {
      const maxTop = Math.max(0, el.scrollHeight - el.clientHeight);
      if (maxTop > 0) el.scrollTop = maxTop;
      setScrollTop(el.scrollTop);
      setInitialized(true);
    });
    return () => {
      el.removeEventListener('scroll', onScroll);
      observer?.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [active, containerRef]);

  const rows = initialWindowRows(viewport);
  const window = React.useMemo<VirtualWindow>(() => {
    if (!active) return { start: 0, end: count, top: 0, bottom: 0 };
    if (!initialized) {
      const start = Math.max(0, count - rows);
      return { start, end: count, top: offsets[start] ?? 0, bottom: 0 };
    }
    return computeVirtualWindow({ offsets, scrollTop, viewportHeight: viewport });
  }, [active, count, initialized, offsets, rows, scrollTop, viewport]);

  const measure = React.useCallback((key: string, height: number) => {
    if (!Number.isFinite(height) || height <= 0) return;
    const rounded = Math.round(height);
    setHeights((prev) => (prev[key] === rounded ? prev : { ...prev, [key]: rounded }));
  }, []);

  return { window, measure };
}
