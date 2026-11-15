// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StageDirection } from '@wbfm/shared/schemas';
import { findTheaterEpisode, theaterStepMs } from '../theater-script';
import { useStageTheater } from '../use-stage-theater';

vi.mock('../use-theater-preload', () => ({ useTheaterPreload: () => undefined }));
vi.mock('../use-theater-audio', () => ({
  useTheaterAudio: () => ({ bgmMuted: false, audioBlocked: false, toggleBgm: () => undefined }),
}));

const EPISODE = findTheaterEpisode();
let clock = 0;

function makeVoice(speaking = false) {
  return {
    speak: vi.fn(async () => 'played' as const),
    stop: vi.fn(),
    unlock: vi.fn(),
    speaking,
    getLevel: () => 0,
  };
}

function setup(speaking = false) {
  const applied: StageDirection[] = [];
  const voice = makeVoice(speaking);
  const applyDirection = (direction: StageDirection) => {
    applied.push(direction);
  };
  const utils = renderHook(() =>
    useStageTheater({ enabled: true, episode: EPISODE, applyDirection, voice }),
  );
  return { ...utils, applied, voice };
}

function markAllReady(state: { current: ReturnType<typeof useStageTheater> }) {
  act(() => {
    for (const member of EPISODE.cast) state.current.markActorReady(member.slot);
  });
}

/** 导演时间线用 performance.now 计时，必须让时钟与定时器一起按 250ms 粒度前进 */
function advance(ms: number) {
  const chunk = 250;
  for (let elapsed = 0; elapsed < ms; elapsed += chunk) {
    const delta = Math.min(chunk, ms - elapsed);
    act(() => {
      clock += delta;
      vi.advanceTimersByTime(delta);
    });
  }
}

beforeEach(() => {
  clock = 0;
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  });
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('剧场导演时间线（S5）', () => {
  it('进入剧场先换 cast，再按首句派发完整指令', () => {
    const { result, applied } = setup();

    expect(applied[0]).toEqual({ t: 'cast', members: EPISODE.cast });
    expect(applied.slice(1).map((direction) => direction.t)).toEqual([
      'focus',
      'speech',
      'expression',
      'motion',
    ]);
    expect(applied[1]).toEqual({ t: 'focus', slot: EPISODE.lines[0]!.slot });
    expect(applied[2]).toMatchObject({ t: 'speech', seq: 0, text: EPISODE.lines[0]!.text });
    expect(result.current.index).toBe(0);
    expect(result.current.total).toBe(EPISODE.lines.length);
    expect(result.current.cue).toEqual(
      expect.objectContaining({ kind: expect.stringMatching(/motion|behavior/) }),
    );
  });

  it('三席就绪后按句子时长自动推进到下一句', () => {
    const { result, applied } = setup();
    expect(result.current.ready).toBe(false);

    markAllReady(result);
    expect(result.current.ready).toBe(true);

    const step = theaterStepMs(EPISODE.lines[0]!);
    advance(step - 250);
    expect(result.current.index).toBe(0);

    advance(500);
    expect(result.current.index).toBe(1);
    expect(applied.filter((direction) => direction.t === 'speech').at(-1)).toMatchObject({
      seq: 1,
      text: EPISODE.lines[1]!.text,
    });
  });

  it('暂停停止推进，恢复后继续', () => {
    const { result } = setup();
    markAllReady(result);

    act(() => result.current.toggle());
    expect(result.current.playing).toBe(false);
    advance(15000);
    expect(result.current.index).toBe(0);

    act(() => result.current.toggle());
    expect(result.current.playing).toBe(true);
    advance(theaterStepMs(EPISODE.lines[0]!) + 300);
    expect(result.current.index).toBe(1);
  });

  it('上一句/下一句循环，重播回到首句', () => {
    const { result } = setup();
    const total = EPISODE.lines.length;

    act(() => result.current.next());
    expect(result.current.index).toBe(1);

    act(() => result.current.prev());
    expect(result.current.index).toBe(0);

    act(() => result.current.prev());
    expect(result.current.index).toBe(total - 1);

    act(() => result.current.next());
    expect(result.current.index).toBe(0);

    act(() => result.current.next());
    act(() => result.current.next());
    act(() => result.current.restart());
    expect(result.current.index).toBe(0);
    expect(result.current.playing).toBe(true);
  });

  it('语音播放期间不推进，超过 15s 兜底继续', () => {
    const { result } = setup(true);
    markAllReady(result);

    advance(13000);
    expect(result.current.index).toBe(0);

    advance(4000);
    expect(result.current.index).toBe(1);
  });
});
