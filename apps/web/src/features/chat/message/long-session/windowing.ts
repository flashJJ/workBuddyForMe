/**
 * v4.20：长会话窗口化纯函数。
 *
 * 分块与虚拟化阈值是契约的一部分；这里只做数学，不接触 DOM。
 */
export const LONG_LIST_CHUNK = 50;
export const LONG_LIST_VIRTUALIZE_THRESHOLD = 200;
export const LONG_LIST_OVERSCAN = 10;
export const MESSAGE_ESTIMATED_HEIGHT = 120;

/** 前缀高度：未测量的消息按估算高度占位 */
export function buildOffsets(
  heights: Array<number | undefined>,
  estimate = MESSAGE_ESTIMATED_HEIGHT,
): number[] {
  const offsets = new Array<number>(heights.length + 1);
  offsets[0] = 0;
  for (let index = 0; index < heights.length; index += 1) {
    const height = heights[index];
    const usable = typeof height === 'number' && Number.isFinite(height) && height > 0;
    offsets[index + 1] = offsets[index]! + (usable ? height : estimate);
  }
  return offsets;
}

/** 二分查找：返回满足 offsets[i] <= value 的最大 i */
export function findOffsetIndex(offsets: number[], value: number): number {
  let low = 0;
  let high = Math.max(0, offsets.length - 1);
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if ((offsets[mid] ?? 0) <= value) low = mid;
    else high = mid - 1;
  }
  return low;
}

export interface VirtualWindow {
  start: number;
  end: number;
  top: number;
  bottom: number;
}

/** 根据滚动位置计算可见区间与上下占位高度 */
export function computeVirtualWindow({
  offsets,
  scrollTop,
  viewportHeight,
  overscan = LONG_LIST_OVERSCAN,
}: {
  offsets: number[];
  scrollTop: number;
  viewportHeight: number;
  overscan?: number;
}): VirtualWindow {
  const count = Math.max(0, offsets.length - 1);
  if (count === 0) return { start: 0, end: 0, top: 0, bottom: 0 };
  const safeTop = Math.max(0, scrollTop);
  const first = findOffsetIndex(offsets, safeTop);
  const last = findOffsetIndex(offsets, safeTop + Math.max(1, viewportHeight));
  const start = Math.max(0, Math.min(count, first - overscan));
  const end = Math.max(start, Math.min(count, last + 1 + overscan));
  return {
    start,
    end,
    top: offsets[start]!,
    bottom: Math.max(0, offsets[count]! - offsets[end]!),
  };
}

/** 首次进入虚拟化时先渲染底部一段，避免从顶部闪一下 */
export function initialWindowRows(
  viewportHeight = 600,
  estimate = MESSAGE_ESTIMATED_HEIGHT,
  overscan = LONG_LIST_OVERSCAN,
): number {
  return Math.ceil(Math.max(1, viewportHeight) / estimate) + overscan;
}

/** 分块模式的初始起点：只挂载最近 50 条 */
export function initialChunkStart(count: number, chunk = LONG_LIST_CHUNK): number {
  return Math.max(0, count - Math.max(1, chunk));
}
