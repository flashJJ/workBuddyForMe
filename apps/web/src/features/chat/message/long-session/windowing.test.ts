import { describe, expect, it } from 'vitest';
import {
  LONG_LIST_CHUNK,
  LONG_LIST_OVERSCAN,
  MESSAGE_ESTIMATED_HEIGHT,
  buildOffsets,
  computeVirtualWindow,
  findOffsetIndex,
  initialChunkStart,
  initialWindowRows,
} from './windowing';

describe('v4.20 长会话窗口化', () => {
  it('未测量消息按估算高度占位，已测量值优先', () => {
    const offsets = buildOffsets([100, undefined, 300], 120);
    expect(offsets).toEqual([0, 100, 220, 520]);
  });

  it('二分查找返回覆盖滚动位置的消息索引', () => {
    const offsets = [0, 100, 220, 520];
    expect(findOffsetIndex(offsets, 0)).toBe(0);
    expect(findOffsetIndex(offsets, 99)).toBe(0);
    expect(findOffsetIndex(offsets, 100)).toBe(1);
    expect(findOffsetIndex(offsets, 400)).toBe(2);
  });

  it('可见区间带前后 overscan，上下占位与总高度一致', () => {
    const offsets = [0, 100, 200, 300, 400, 500];
    const win = computeVirtualWindow({
      offsets,
      scrollTop: 200,
      viewportHeight: 100,
      overscan: 1,
    });
    expect(win).toEqual({ start: 1, end: 5, top: 100, bottom: 0 });

    const all = computeVirtualWindow({
      offsets,
      scrollTop: 0,
      viewportHeight: 1000,
      overscan: LONG_LIST_OVERSCAN,
    });
    expect(all).toEqual({ start: 0, end: 5, top: 0, bottom: 0 });
  });

  it('空列表返回零窗口', () => {
    expect(computeVirtualWindow({ offsets: [0], scrollTop: 0, viewportHeight: 600 })).toEqual({
      start: 0,
      end: 0,
      top: 0,
      bottom: 0,
    });
  });

  it('初始分块只保留最近 50 条，虚拟化首屏按视口估算', () => {
    expect(initialChunkStart(120)).toBe(70);
    expect(initialChunkStart(30)).toBe(0);
    expect(initialChunkStart(120, LONG_LIST_CHUNK)).toBe(120 - LONG_LIST_CHUNK);
    expect(initialWindowRows(600, MESSAGE_ESTIMATED_HEIGHT, 10)).toBe(15);
  });
});
