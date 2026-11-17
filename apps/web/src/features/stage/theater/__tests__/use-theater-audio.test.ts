// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { findTheaterEpisode } from '../theater-script';
import { useTheaterAudio } from '../use-theater-audio';
import { audioDirector } from '../../../audio';

interface FakeBgm {
  start: Mock;
  stop: Mock;
  setGain: Mock;
  setMood: Mock;
  dispose: Mock;
}

const bgmState = vi.hoisted(() => ({ created: [] as FakeBgm[], startResult: true }));
const sfxState = vi.hoisted(() => ({ play: vi.fn(async () => undefined) }));

vi.mock('../theater-sfx', () => ({
  playTheaterSfx: sfxState.play,
  unlockTheaterSfx: vi.fn(),
  setTheaterSfxOutputDevice: vi.fn(),
}));

vi.mock('../theater-bgm', () => ({
  TheaterBgm: class {
    start = vi.fn(async () => bgmState.startResult);
    stop = vi.fn();
    setGain = vi.fn();
    setOutputDevice = vi.fn();
    setMood = vi.fn();
    dispose = vi.fn();
    constructor() {
      bgmState.created.push(this as unknown as FakeBgm);
    }
  },
}));

const EPISODE = findTheaterEpisode();
const LINE = EPISODE.lines[0]!;
const SPEAKER_MEMBER = EPISODE.cast.find((member) => member.slot === LINE.slot);
const SPEAKER = SPEAKER_MEMBER?.avatarModelId ?? '';
const SPEAKER_SID = SPEAKER_MEMBER?.voicePreference?.speakerSid ?? null;

function makeVoice() {
  return {
    speak: vi.fn(async () => 'played' as const),
    stop: vi.fn(),
    unlock: vi.fn(),
    speaking: false,
    getLevel: () => 0,
  };
}

function setup(options: { playing?: boolean; ready?: boolean; index?: number } = {}) {
  const voice = makeVoice();
  const utils = renderHook(
    ({ playing, speaking, index }) =>
      useTheaterAudio({
        enabled: true,
        playing,
        ready: options.ready ?? true,
        episode: EPISODE,
        line: LINE,
        index,
        voice: { ...voice, speaking },
      }),
    {
      initialProps: {
        playing: options.playing ?? true,
        speaking: false,
        index: options.index ?? 0,
      },
    },
  );
  const bgm = () => bgmState.created.at(-1)!;
  return { ...utils, voice, bgm };
}

const flush = () =>
  act(async () => {
    await Promise.resolve();
  });

beforeEach(() => {
  bgmState.created.length = 0;
  bgmState.startResult = true;
  sfxState.play.mockClear();
  window.localStorage.clear();
  audioDirector.setMuted(false);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('剧场音频编排（S5）', () => {
  it('就绪且播放时启动 BGM、合成当前句', async () => {
    const { voice, bgm } = setup();
    await flush();

    expect(bgm().start).toHaveBeenCalledTimes(1);
    expect(voice.speak).toHaveBeenCalledWith(LINE.text, SPEAKER, SPEAKER_SID);
  });

  it('开场幕布音一次、换句一声提示音，静音后不再播放', async () => {
    const { result, rerender } = setup();
    await flush();
    expect(sfxState.play).toHaveBeenCalledTimes(1);
    expect(sfxState.play).toHaveBeenLastCalledWith('curtain');

    rerender({ playing: true, speaking: false, index: 1 });
    expect(sfxState.play).toHaveBeenLastCalledWith('line', 'slice-of-life');
    expect(sfxState.play).toHaveBeenCalledTimes(2);

    act(() => result.current.toggleBgm());
    expect(result.current.bgmMuted).toBe(true);

    rerender({ playing: true, speaking: false, index: 2 });
    expect(sfxState.play).toHaveBeenCalledTimes(2);
  });

  it('跨幕切换配乐情绪与换句音色', async () => {
    const { bgm, rerender } = setup({ index: 0 });
    await flush();
    expect(bgm().setMood).toHaveBeenLastCalledWith('warm');

    rerender({ playing: true, speaking: false, index: 3 });
    expect(bgm().setMood).toHaveBeenLastCalledWith('playful');
    expect(sfxState.play).toHaveBeenLastCalledWith('line', 'comedy');
  });

  it('暂停时停语音与 BGM，恢复后补播当前句', async () => {
    const { voice, bgm, rerender } = setup();
    await flush();
    const starts = bgm().start.mock.calls.length;

    rerender({ playing: false, speaking: false, index: 0 });
    expect(voice.stop).toHaveBeenCalled();
    expect(bgm().stop).toHaveBeenCalled();
    expect(bgm().start.mock.calls.length).toBe(starts);

    rerender({ playing: true, speaking: false, index: 0 });
    await flush();
    expect(voice.speak).toHaveBeenCalledTimes(2);
    expect(bgm().start.mock.calls.length).toBeGreaterThan(starts);
  });

  it('模型未就绪时不开口也不放 BGM', async () => {
    const { voice, bgm } = setup({ ready: false });
    await flush();

    expect(voice.speak).not.toHaveBeenCalled();
    expect(voice.stop).toHaveBeenCalled();
    expect(bgm().start).not.toHaveBeenCalled();
  });

  it('静音切换 BGM，被自动播放策略拦截时首次点击只负责解锁', async () => {
    bgmState.startResult = false;
    const { result, bgm } = setup();
    await flush();
    expect(result.current.audioBlocked).toBe(true);

    await act(async () => {
      result.current.toggleBgm();
    });
    expect(result.current.bgmMuted).toBe(false);
    expect(bgm().start).toHaveBeenCalledTimes(2);

    bgmState.startResult = true;
    await act(async () => {
      result.current.toggleBgm();
    });
    expect(result.current.audioBlocked).toBe(false);

    act(() => result.current.toggleBgm());
    expect(result.current.bgmMuted).toBe(true);

    act(() => result.current.toggleBgm());
    expect(result.current.bgmMuted).toBe(false);
  });

  it('切后台停声、回前台补播', async () => {
    const { voice, bgm } = setup();
    await flush();

    let hidden = true;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    try {
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(voice.stop).toHaveBeenCalled();
      expect(bgm().stop).toHaveBeenCalled();

      hidden = false;
      const speaks = voice.speak.mock.calls.length;
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(voice.speak.mock.calls.length).toBe(speaks + 1);
    } finally {
      Reflect.deleteProperty(document, 'hidden');
    }
  });
});
