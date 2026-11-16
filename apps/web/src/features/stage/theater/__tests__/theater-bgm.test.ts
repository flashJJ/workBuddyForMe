// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TheaterBgm } from '../theater-bgm';

class FakeAudio {
  src: string;
  loop = false;
  preload = 'auto';
  volume = 1;
  paused = true;
  play = vi.fn(async () => {
    this.paused = false;
  });
  pause = vi.fn(() => {
    this.paused = true;
  });
  load = vi.fn();
  removeAttribute = vi.fn((name: string) => {
    if (name === 'src') this.src = '';
  });

  constructor(src: string) {
    this.src = src;
  }
}

const audios: FakeAudio[] = [];

function installAudio() {
  audios.length = 0;
  Object.defineProperty(window, 'Audio', {
    configurable: true,
    writable: true,
    value: function AudioStub(src: string) {
      const el = new FakeAudio(src);
      audios.push(el);
      return el;
    },
  });
}

const last = () => audios.at(-1)!;

beforeEach(() => {
  vi.useFakeTimers();
  installAudio();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('剧场 BGM（CC0 曲目）', () => {
  it('自动播放拦截时返回 false，解锁后可启动并淡入', async () => {
    const bgm = new TheaterBgm();
    const el = new FakeAudio('/audio/music/theme-warm.mp3');
    audios.push(el);
    Object.defineProperty(window, 'Audio', {
      configurable: true,
      writable: true,
      value: function AudioStub() {
        return el;
      },
    });
    el.play.mockRejectedValueOnce(new Error('blocked'));

    await expect(bgm.start()).resolves.toBe(false);
    expect(el.volume).toBe(0);

    await expect(bgm.start()).resolves.toBe(true);
    vi.advanceTimersByTime(900);
    expect(el.volume).toBeCloseTo(0.3);
    expect(el.paused).toBe(false);
    bgm.dispose();
  });

  it('导演系数只改音量：1 / 0.35 / 0 / 停止归零', async () => {
    const bgm = new TheaterBgm();
    await bgm.start();
    vi.advanceTimersByTime(900);
    const el = last();
    expect(el.src).toContain('theme-warm.mp3');
    expect(el.volume).toBeCloseTo(0.3);

    bgm.setGain(0.35);
    vi.advanceTimersByTime(200);
    expect(el.volume).toBeCloseTo(0.105);
    bgm.setGain(1);
    vi.advanceTimersByTime(200);
    expect(el.volume).toBeCloseTo(0.3);

    bgm.setGain(0);
    vi.advanceTimersByTime(200);
    expect(el.volume).toBe(0);
    bgm.setGain(1);
    vi.advanceTimersByTime(200);
    expect(el.volume).toBeCloseTo(0.3);

    bgm.stop();
    vi.advanceTimersByTime(900);
    expect(el.volume).toBe(0);
    expect(el.paused).toBe(true);
    bgm.dispose();
  });

  it('换幕时淡出旧曲、切换到对应 CC0 曲目再淡入', async () => {
    const bgm = new TheaterBgm();
    await bgm.start();
    vi.advanceTimersByTime(900);
    const el = last();
    expect(el.src).toContain('theme-warm.mp3');

    bgm.setMood('playful');
    vi.advanceTimersByTime(900);
    expect(el.src).toContain('theme-playful.mp3');
    expect(el.play).toHaveBeenCalledTimes(2);
    expect(el.paused).toBe(false);

    vi.advanceTimersByTime(900);
    expect(el.volume).toBeCloseTo(0.3);
    bgm.dispose();
  });

  it('未运行时切情绪只记录，下次 start 使用新曲目', async () => {
    const bgm = new TheaterBgm();
    bgm.setMood('tense');
    bgm.setMood('melancholy');
    await bgm.start();
    expect(last().src).toContain('theme-melancholy.mp3');
    bgm.dispose();
  });

  it('换曲淡出途中停止，下次 start 仍补齐新曲目', async () => {
    const bgm = new TheaterBgm();
    await bgm.start();
    vi.advanceTimersByTime(900);
    const el = last();

    bgm.setMood('tense');
    bgm.stop();
    vi.advanceTimersByTime(900);

    await expect(bgm.start()).resolves.toBe(true);
    expect(el.src).toContain('theme-tense.mp3');
    bgm.dispose();
  });

  it('dispose 暂停并释放音频源，重复 start 重建元素', async () => {
    const bgm = new TheaterBgm();
    await bgm.start();
    const el = last();
    bgm.dispose();
    expect(el.paused).toBe(true);
    expect(el.src).toBe('');
    expect(el.load).toHaveBeenCalled();

    await expect(bgm.start()).resolves.toBe(true);
    expect(audios).toHaveLength(2);
    bgm.dispose();
  });
});
