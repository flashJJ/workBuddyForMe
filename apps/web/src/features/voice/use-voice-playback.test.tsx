// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useVoicePlayback } from './use-voice-playback';
import { WebAudioPlayer } from './web-audio-player';
import { audioDirector } from '../audio';

describe('useVoicePlayback', () => {
  it('StrictMode 挂载→清理→重挂后，入队的语音帧仍会被播放（回归：渲染期单例被 dispose 永久拒帧）', async () => {
    // play 打桩：jsdom 无真实 AudioContext，且本用例只验证「帧能穿过队列到达播放器」
    const playSpy = vi.spyOn(WebAudioPlayer.prototype, 'play').mockResolvedValue(undefined);

    const { result } = renderHook(() => useVoicePlayback(), { wrapper: StrictMode });

    await act(async () => {
      result.current.enqueue({
        fragment: '你好',
        spoken: '你好',
        audio: 'wav',
        sampleRate: 44100,
        final: true,
      });
      // 队列 pump 为 async：两个微任务节拍保证 play 已被调用
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(playSpy).toHaveBeenCalledTimes(1);
    playSpy.mockRestore();
  });

  it('解码期间 cancel：迟到的旧音频不得再启动（避免与新语音重叠）', async () => {
    let resolveDecode: ((buffer: AudioBuffer) => void) | null = null;
    const decodePromise = new Promise<AudioBuffer>((resolve) => {
      resolveDecode = resolve;
    });
    const starts: Array<ReturnType<typeof vi.fn>> = [];
    class FakeAudioContext {
      state = 'running';
      destination = {};
      decodeAudioData = vi.fn(() => decodePromise);
      createBufferSource = vi.fn(() => {
        const start = vi.fn();
        starts.push(start);
        return {
          buffer: null,
          connect: vi.fn(),
          start,
          stop: vi.fn(),
          onended: null,
        };
      });
      createAnalyser = vi.fn(() => ({
        fftSize: 0,
        smoothingTimeConstant: 0,
        connect: vi.fn(),
        getByteTimeDomainData: vi.fn(),
      }));
      createScriptProcessor = vi.fn(() => ({ connect: vi.fn(), onaudioprocess: null }));
      createGain = vi.fn(() => ({ gain: { value: 0 }, connect: vi.fn() }));
      resume = vi.fn();
    }
    vi.stubGlobal('AudioContext', FakeAudioContext);

    const player = new WebAudioPlayer();
    const playing = player.play({
      fragment: '旧语音',
      spoken: '旧语音',
      audio: 'AA==',
      sampleRate: 24000,
      final: false,
    });
    player.cancelAll();
    resolveDecode!({} as AudioBuffer);
    await playing;

    expect(starts).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it('语音播放期间向导演上报活跃，结束后恢复背景乐', async () => {
    let release: (() => void) | null = null;
    const playSpy = vi
      .spyOn(WebAudioPlayer.prototype, 'play')
      .mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      );
    const music = { setGain: vi.fn() };
    const unregister = audioDirector.registerSink('music', music);
    audioDirector.setMuted(false);

    const { result } = renderHook(() => useVoicePlayback());
    await act(async () => {
      result.current.enqueue({
        fragment: '你好',
        spoken: '你好',
        audio: 'wav',
        sampleRate: 44100,
        final: true,
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(audioDirector.getSnapshot().voiceActive).toBe(true);
    expect(music.setGain).toHaveBeenLastCalledWith(0.35);

    await act(async () => {
      release?.();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(audioDirector.getSnapshot().voiceActive).toBe(false);
    expect(music.setGain).toHaveBeenLastCalledWith(1);
    unregister();
    playSpy.mockRestore();
  });
});
