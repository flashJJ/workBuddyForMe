// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useVoicePlayback } from './use-voice-playback';
import { WebAudioPlayer } from './web-audio-player';

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
});
