// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useStreamFrame } from './use-stream-frame';

describe('useStreamFrame（v2.4 P1-4 合帧与计时）', () => {
  afterEach(() => vi.restoreAllMocks());

  it('同一帧内的多个 delta 合并为一次 append；终态冲刷同步落文本', () => {
    let frame: FrameRequestCallback | null = null;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frame = cb;
      return 1;
    });
    const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    const append = vi.fn();
    const { result } = renderHook(() => useStreamFrame(append));

    act(() => {
      result.current.queueDelta('你');
      result.current.queueDelta('好');
    });
    expect(append).not.toHaveBeenCalled();

    act(() => {
      frame?.(0);
    });
    expect(append).toHaveBeenCalledTimes(1);
    expect(append).toHaveBeenCalledWith('你好');

    act(() => {
      result.current.queueDelta('！');
      result.current.flushPendingDelta();
    });
    expect(cancel).toHaveBeenCalled();
    expect(append).toHaveBeenLastCalledWith('！');
  });

  it('计时：开始 → 首字 → 落定；startTiming/resetStream 清空缓冲与计时', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    const append = vi.fn();
    const { result } = renderHook(() => useStreamFrame(append));

    act(() => {
      result.current.startTiming();
    });
    expect(result.current.timing).toMatchObject({ firstTokenAt: null, settledAt: null });

    act(() => {
      result.current.markFirstToken();
      result.current.settleTiming();
    });
    expect(result.current.timing?.firstTokenAt).toBeTypeOf('number');
    expect(result.current.timing?.settledAt).toBeTypeOf('number');

    act(() => {
      result.current.resetStream();
    });
    expect(result.current.timing).toBeNull();
  });
});
