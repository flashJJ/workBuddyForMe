// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useEventPlayer, type EventPlaybackBridge } from './use-event-player';
import type { EventPlayerControllerLike } from './event-player';

function makeWav(sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(60);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  bytes.set([0x57, 0x41, 0x56, 0x45], 8);
  view.setUint32(24, sampleRate, true);
  return buffer;
}

function makeController(): EventPlayerControllerLike & { calls: string[] } {
  return {
    calls: [],
    setExpression(tag) {
      this.calls.push(`expr:${tag}`);
    },
    flashExpression(tag, ms) {
      this.calls.push(`flash:${tag}:${ms}`);
    },
    tap() {
      this.calls.push('tap');
    },
    setGaze(x, y) {
      this.calls.push(`gaze:${x},${y}`);
    },
  };
}

function makePlayback(): EventPlaybackBridge & { enqueue: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn> } {
  return {
    enqueue: vi.fn(),
    cancel: vi.fn(),
    waitDrained: vi.fn(() => Promise.resolve()),
  };
}

function setup(overrides?: { ttsEnabled?: boolean; ttsReady?: boolean }) {
  const controller = makeController();
  const playback = makePlayback();
  const controllerRef: React.MutableRefObject<EventPlayerControllerLike | null> = {
    current: controller,
  };
  const { result } = renderHook(() =>
    useEventPlayer({
      controllerRef,
      baselineExpression: 'neutral',
      resolveLine: (key) => `L:${key}`,
      playback,
      ttsEnabled: overrides?.ttsEnabled ?? true,
      ttsReady: overrides?.ttsReady ?? true,
    }),
  );
  return { result, controller, playback };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useEventPlayer', () => {
  it('挂载即创建播放器：表情直达控制器，release 回到情绪基线', () => {
    const { result, controller } = setup();
    const player = result.current.playerRef.current;
    expect(player).not.toBeNull();
    act(() => player!.expression('joy'));
    expect(controller.calls).toContain('expr:joy');
    expect(result.current.view.playing).toBe(true);

    act(() => player!.release());
    expect(controller.calls.at(-1)).toBe('expr:neutral');
    expect(result.current.view.playing).toBe(false);
  });

  it('出声台词：/tts 合成 WAV 经同一播放队列出声（final 单段帧）', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => makeWav(22050),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const { result, playback } = setup();

    await act(async () => {
      await result.current.playerRef.current!.speech('ev.greet', true, new AbortController().signal);
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(playback.enqueue).toHaveBeenCalledOnce();
    const frame = playback.enqueue.mock.calls[0]![0] as {
      audio: string | null;
      sampleRate: number;
      final: boolean;
      fragment: string;
    };
    expect(frame.final).toBe(true);
    expect(frame.sampleRate).toBe(22050);
    expect(frame.audio).toBeTruthy();
    expect(frame.fragment).toBe('L:ev.greet');
    expect(result.current.view.subtitle).toBe('L:ev.greet');
  });

  it('出声门控关闭（开关关/模型未就绪）时不请求 TTS，纯气泡呈现', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = setup({ ttsEnabled: false, ttsReady: true });

    await act(async () => {
      await result.current.playerRef.current!.speech('ev.greet', true, new AbortController().signal);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.view.subtitle).toBe('L:ev.greet');
  });

  it('台词 abort：立即停止播放（让出 TTS 锁）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, arrayBuffer: async () => makeWav(16000) })),
    );
    const { result, playback } = setup();
    const ac = new AbortController();
    const pending = act(async () => {
      await result.current.playerRef.current!.speech('ev.greet', true, ac.signal);
    });
    ac.abort();
    await pending;
    expect(playback.cancel).toHaveBeenCalled();
  });
});
