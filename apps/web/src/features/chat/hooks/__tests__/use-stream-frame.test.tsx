// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useStreamFrame } from '../use-stream-frame';

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
      result.current.settleTiming(true);
    });
    expect(result.current.timing?.firstTokenAt).toBeTypeOf('number');
    expect(result.current.timing?.settledAt).toBeTypeOf('number');
    expect(result.current.timing?.ok).toBe(true);

    act(() => {
      result.current.resetStream();
    });
    expect(result.current.timing).toBeNull();
  });

  it('v4.20：首段按换行或 80 字符判定，并写 Performance 打点', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    const mark = vi.spyOn(performance, 'mark').mockImplementation(() => ({}) as PerformanceMark);
    const append = vi.fn();
    const { result } = renderHook(() => useStreamFrame(append));

    act(() => {
      result.current.startTiming();
      result.current.markFirstToken();
      result.current.queueDelta('第一段还没有换行');
    });
    expect(result.current.timing?.firstParagraphAt).toBeNull();

    act(() => {
      result.current.queueDelta('\n第二段');
    });
    expect(result.current.timing?.firstParagraphAt).toBeTypeOf('number');
    expect(mark.mock.calls.map(([name]) => name)).toEqual(
      expect.arrayContaining(['wbfm:send', 'wbfm:first-token', 'wbfm:first-paragraph']),
    );
  });

  it('v4.20：错误/停止落定为 ok=false，只有正常完成才进入基线', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    const { result } = renderHook(() => useStreamFrame(vi.fn()));

    act(() => {
      result.current.startTiming();
      result.current.settleTiming();
    });
    expect(result.current.timing?.ok).toBe(false);

    act(() => {
      result.current.startTiming();
      result.current.settleTiming(true);
    });
    expect(result.current.timing?.ok).toBe(true);
  });
});
