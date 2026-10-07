// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useVadMonitor } from './use-vad-monitor';
import type { VadGate } from './vad-detector';

const FRAME = 512;

class FakeWorkletPort {
  onmessage: ((e: MessageEvent) => void) | null = null;
  start(): void {}
  postMessage(): void {}
  emit(rms: number, samples: Float32Array): void {
    this.onmessage?.({ data: { rms, pcm16k: samples.buffer } } as MessageEvent);
  }
}

class FakeWorkletNode {
  static instances: FakeWorkletNode[] = [];
  readonly port = new FakeWorkletPort();
  disconnect = vi.fn();
  connect = vi.fn();
  constructor() {
    FakeWorkletNode.instances.push(this);
  }
}

class FakeAudioContext {
  state: AudioContextState = 'running';
  destination = {};
  audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) };
  resume = vi.fn((): Promise<void> => Promise.resolve());
  close = vi.fn((): Promise<void> => Promise.resolve());
  createMediaStreamSource = vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() }));
  createGain = vi.fn(() => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }));
}

function frame(rms: number): Float32Array {
  const pcm = new Float32Array(FRAME);
  // 简化：用 RMS 等效常数填充（测试只关心缓冲长度与检测器决策）
  pcm.fill(rms);
  return pcm;
}

function emitFrames(port: FakeWorkletPort, rms: number, count: number): void {
  for (let i = 0; i < count; i += 1) port.emit(rms, frame(rms));
}

describe('useVadMonitor', () => {
  let getTracks: ReturnType<typeof vi.fn>;
  let getUserMedia: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    FakeWorkletNode.instances = [];
    getTracks = vi.fn(() => [{ stop: vi.fn() }]);
    getUserMedia = vi.fn().mockResolvedValue({ getTracks });
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    Object.defineProperty(globalThis, 'AudioContext', {
      configurable: true,
      writable: true,
      value: FakeAudioContext,
    });
    Object.defineProperty(globalThis, 'AudioWorkletNode', {
      configurable: true,
      writable: true,
      value: FakeWorkletNode,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('enabled=false：不申请麦克风，phase=off', () => {
    const { result } = renderHook(() =>
      useVadMonitor({
        enabled: false,
        sensitivity: 'balanced',
        silenceMs: 900,
        getGate: () => ({ speaking: false, inCooldown: false }),
        onSegment: vi.fn(),
      }),
    );
    expect(result.current.phase).toBe('off');
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('enabled=true：申请麦克风（含 autoGainControl:false）并进入 on', async () => {
    const { result } = renderHook(() =>
      useVadMonitor({
        enabled: true,
        sensitivity: 'balanced',
        silenceMs: 900,
        getGate: () => ({ speaking: false, inCooldown: false }),
        onSegment: vi.fn(),
      }),
    );
    await waitFor(() => expect(result.current.phase).toBe('on'));
    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: expect.objectContaining({ autoGainControl: false, echoCancellation: true }),
      }),
    );
  });

  it('静音→说话→尾静音：产出一个完整段；最短短语丢弃不产段', async () => {
    const onSegment = vi.fn();
    const { result } = renderHook(() =>
      useVadMonitor({
        enabled: true,
        sensitivity: 'balanced',
        silenceMs: 900,
        getGate: () => ({ speaking: false, inCooldown: false }),
        onSegment,
      }),
    );
    await waitFor(() => expect(result.current.phase).toBe('on'));
    const port = FakeWorkletNode.instances[0]!.port;

    await act(async () => {
      emitFrames(port, 0.008, 25); // 校准（保持底噪 0.008）
      emitFrames(port, 0.1, 12); // 候选→说话
      emitFrames(port, 0.001, 40); // 尾静音 → speech-end
    });

    expect(onSegment).toHaveBeenCalledTimes(1);
    const samples = onSegment.mock.calls[0]![0] as Float32Array;
    expect(samples.length).toBeGreaterThan(12 * FRAME);
  });

  it('speech-start 事件透传给 onVadEvent（barge-in 挂钩点）', async () => {
    const onVadEvent = vi.fn();
    const { result } = renderHook(() =>
      useVadMonitor({
        enabled: true,
        sensitivity: 'balanced',
        silenceMs: 900,
        getGate: () => ({ speaking: false, inCooldown: false }),
        onSegment: vi.fn(),
        onVadEvent,
      }),
    );
    await waitFor(() => expect(result.current.phase).toBe('on'));
    await act(async () => {
      const port = FakeWorkletNode.instances[0]!.port;
      emitFrames(port, 0.008, 25);
      emitFrames(port, 0.1, 10);
    });
    expect(onVadEvent).toHaveBeenCalledWith('speech-start');
  });

  it('播放门控：speaking 时普通能量被抑制（getGate 每帧被查询）', async () => {
    const getGate = vi.fn((): VadGate => ({ speaking: true, inCooldown: false }));
    const onVadEvent = vi.fn();
    const { result } = renderHook(() =>
      useVadMonitor({
        enabled: true,
        sensitivity: 'balanced',
        silenceMs: 900,
        getGate,
        onSegment: vi.fn(),
        onVadEvent,
      }),
    );
    await waitFor(() => expect(result.current.phase).toBe('on'));
    await act(async () => {
      const port = FakeWorkletNode.instances[0]!.port;
      emitFrames(port, 0.008, 25); // 底噪 0.008：播报门槛 0.056
      emitFrames(port, 0.04, 25); // 空闲态会触发、播报态不触发
    });
    expect(getGate).toHaveBeenCalled();
    expect(onVadEvent).not.toHaveBeenCalledWith('candidate');
  });

  it('关闭时停止麦克风采音轨', async () => {
    const stop = vi.fn();
    getTracks.mockReturnValue([{ stop }]);
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useVadMonitor({
          enabled,
          sensitivity: 'balanced',
          silenceMs: 900,
          getGate: () => ({ speaking: false, inCooldown: false }),
          onSegment: vi.fn(),
        }),
      { initialProps: { enabled: true } },
    );
    await waitFor(() => {
      /* phase 就绪由重渲染后检查 */
    });
    // 等待 getUserMedia 完成
    await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    act(() => rerender({ enabled: false }));
    expect(stop).toHaveBeenCalled();
  });

  it('麦克风权限拒绝 → error.permission_denied 且 phase=off', async () => {
    getUserMedia.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'));
    const { result } = renderHook(() =>
      useVadMonitor({
        enabled: true,
        sensitivity: 'balanced',
        silenceMs: 900,
        getGate: () => ({ speaking: false, inCooldown: false }),
        onSegment: vi.fn(),
      }),
    );
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error?.code).toBe('permission_denied');
    expect(result.current.phase).toBe('off');
  });
});
