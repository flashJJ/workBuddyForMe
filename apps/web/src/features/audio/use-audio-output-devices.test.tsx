// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { audioDirector } from './director';
import { useAudioOutputDevices } from './use-audio-output-devices';

function stubDevices(devices: MediaDeviceInfo[] | null) {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: devices
      ? {
          enumerateDevices: vi.fn(async () => devices),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }
      : undefined,
  });
}

afterEach(() => {
  audioDirector.setOutputDevice(null);
  stubDevices(null);
});

describe('useAudioOutputDevices（v4.3 M4）', () => {
  it('枚举 audiooutput，选择后写回导演', async () => {
    stubDevices([
      { kind: 'audiooutput', deviceId: 'speaker-1', label: 'Speaker' },
      { kind: 'audioinput', deviceId: 'mic-1', label: 'Mic' },
    ] as unknown as MediaDeviceInfo[]);
    const { result } = renderHook(() => useAudioOutputDevices());

    await waitFor(() => expect(result.current.devices).toHaveLength(1));
    expect(result.current.supported).toBe(true);
    expect(result.current.devices[0]).toEqual({ deviceId: 'speaker-1', label: 'Speaker' });

    act(() => result.current.select('speaker-1'));
    expect(result.current.selected).toBe('speaker-1');
    expect(audioDirector.getOutputDevice()).toBe('speaker-1');
  });

  it('没有 mediaDevices 时标记不支持', async () => {
    stubDevices(null);
    const { result } = renderHook(() => useAudioOutputDevices());
    await waitFor(() => expect(result.current.supported).toBe(false));
    expect(result.current.devices).toEqual([]);
  });
});
