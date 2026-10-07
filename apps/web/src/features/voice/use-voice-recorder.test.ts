// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useVoiceRecorder } from './use-voice-recorder';

interface FakeProcessor {
  onaudioprocess: ((event: { inputBuffer: { getChannelData: (c: number) => Float32Array } }) => void) | null;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

function installAudioMocks() {
  const processor: FakeProcessor = {
    onaudioprocess: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const gain = { connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1 } };
  const stream = { getTracks: () => [{ stop: vi.fn() }] };

  class FakeAudioContext {
    sampleRate = 48000;
    destination = {};
    createMediaStreamSource = vi.fn(() => source);
    createScriptProcessor = vi.fn(() => processor);
    createGain = vi.fn(() => gain);
    close = vi.fn(async () => undefined);
  }
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal(
    'webkitAudioContext',
    undefined,
  );
  return { processor, source, gain, stream };
}

function emitAudio(processor: FakeProcessor, chunks = 4, frameSize = 4096) {
  for (let i = 0; i < chunks; i += 1) {
    processor.onaudioprocess!({
      inputBuffer: { getChannelData: () => new Float32Array(frameSize).fill(0.1) },
    });
  }
}

function asrEnvelope(text: string, lang: string | null) {
  return { ok: true, json: async () => ({ success: true, data: { text, lang } }) };
}

describe('useVoiceRecorder', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'navigator',
      Object.assign(Object.create(navigator), {
        mediaDevices: { getUserMedia: vi.fn(async () => {}) },
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('正常 PTT：录音→打包 WAV 上传→返回识别文本', async () => {
    const mocks = installAudioMocks();
    vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(
      mocks.stream as unknown as MediaStream,
    );
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) => asrEnvelope('你好世界', 'zh'),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toBe('recording');

    act(() => emitAudio(mocks.processor));

    let text = '';
    await act(async () => {
      text = await result.current.stopAndRecognize();
    });
    expect(text).toBe('你好世界');
    expect(result.current.state).toBe('idle');

    const init = fetchMock.mock.calls[0]![1]!;
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('file')).toBeInstanceOf(File);
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({ audio: expect.any(Object) }),
    );
  });

  it('录音短于 300ms：不上报，给 too_short 错误并返回空串', async () => {
    const mocks = installAudioMocks();
    vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(
      mocks.stream as unknown as MediaStream,
    );
    const fetchMock = vi.fn(async () => asrEnvelope('不应出现', 'zh'));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.start();
    });
    // 不喂任何音频帧直接停止
    let text = 'untouched';
    await act(async () => {
      text = await result.current.stopAndRecognize();
    });
    expect(text).toBe('');
    expect(result.current.error?.code).toBe('too_short');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('权限被拒绝：映射 permission_denied 并回到 idle', async () => {
    installAudioMocks();
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(
      new DOMException('denied', 'NotAllowedError'),
    );

    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.start();
    });
    await waitFor(() => expect(result.current.state).toBe('idle'));
    expect(result.current.error?.code).toBe('permission_denied');
  });

  it('无麦克风设备：映射 no_device', async () => {
    installAudioMocks();
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(
      new DOMException('not found', 'NotFoundError'),
    );

    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.error?.code).toBe('no_device');
  });

  it('cancel：录音中取消回到 idle，不发起识别请求', async () => {
    const mocks = installAudioMocks();
    vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(
      mocks.stream as unknown as MediaStream,
    );
    const fetchMock = vi.fn(async () => asrEnvelope('x', 'zh'));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.start();
    });
    act(() => emitAudio(mocks.processor));
    act(() => result.current.cancel());
    expect(result.current.state).toBe('idle');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('识别请求失败：返回空串并映射 network 错误', async () => {
    const mocks = installAudioMocks();
    vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(
      mocks.stream as unknown as MediaStream,
    );
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })));

    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.start();
    });
    act(() => emitAudio(mocks.processor));
    let text = '';
    await act(async () => {
      text = await result.current.stopAndRecognize();
    });
    expect(text).toBe('');
    expect(result.current.error?.code).toBe('network');
    expect(result.current.state).toBe('idle');
  });
});
