// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

class FakeParam {
  value = 0;
  setValueAtTime = vi.fn((value: number) => {
    this.value = value;
  });
  linearRampToValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
}

class FakeCtx {
  state: AudioContextState = 'running';
  currentTime = 0;
  sampleRate = 8000;
  destination = {};
  resume = vi.fn(async () => undefined);
  oscs = 0;
  buffers = 0;
  filters = 0;
  oscNodes: { frequency: FakeParam }[] = [];
  createBuffer = vi.fn(() => ({ getChannelData: () => new Float32Array(64) }));
  createBufferSource = vi.fn(() => {
    this.buffers += 1;
    return { buffer: null, connect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null };
  });
  createBiquadFilter = vi.fn(() => {
    this.filters += 1;
    return { type: '', frequency: new FakeParam(), connect: vi.fn() };
  });
  createGain = vi.fn(() => ({ gain: new FakeParam(), connect: vi.fn() }));
  createOscillator = vi.fn(() => {
    this.oscs += 1;
    const node = {
      type: '',
      frequency: new FakeParam(),
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null,
    };
    this.oscNodes.push(node);
    return node;
  });
}

function installCtx(state: AudioContextState = 'running') {
  const ctx = new FakeCtx();
  ctx.state = state;
  Object.defineProperty(window, 'AudioContext', {
    configurable: true,
    writable: true,
    value: function AudioContextStub() {
      return ctx;
    },
  });
  return ctx;
}

async function loadSfx() {
  vi.resetModules();
  const audio = await import('../../../audio');
  const sfx = await import('../theater-sfx');
  return { sfx, audio };
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('剧场短音效（v4.2 导演接管）', () => {
  it('没有 WebAudio 时静默返回', async () => {
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      writable: true,
      value: undefined,
    });
    const { sfx } = await loadSfx();
    await expect(sfx.playTheaterSfx('line')).resolves.toBeUndefined();
  });

  it('幕布音走噪声缓冲与低通，换句音走短促振荡器', async () => {
    const ctx = installCtx();
    const { sfx, audio } = await loadSfx();

    await sfx.playTheaterSfx('curtain');
    expect(ctx.buffers).toBe(1);
    expect(ctx.filters).toBe(1);
    expect(ctx.oscs).toBe(0);
    audio.audioDirector.endSfx();

    await sfx.playTheaterSfx('line');
    expect(ctx.oscs).toBe(1);
    audio.audioDirector.endSfx();

    await sfx.playTheaterSfx('line', 'comedy');
    expect(ctx.oscNodes[1]!.frequency.value).toBeCloseTo(1046.5);
    audio.audioDirector.endSfx();

    await sfx.playTheaterSfx('line', 'tragedy');
    expect(ctx.oscNodes[2]!.frequency.value).toBeCloseTo(392);
    audio.audioDirector.endSfx();
  });

  it('静音后不再创建音频节点', async () => {
    const ctx = installCtx();
    const { sfx, audio } = await loadSfx();

    audio.audioDirector.setMuted(true);
    await sfx.playTheaterSfx('line');
    expect(ctx.oscs).toBe(0);
    expect(ctx.buffers).toBe(0);
  });

  it('自动播放策略拦截时跳过发声并释放并发额度', async () => {
    const ctx = installCtx('suspended');
    const { sfx } = await loadSfx();

    await sfx.playTheaterSfx('line');
    expect(ctx.oscs).toBe(0);
  });

  it('同时最多 2 个音效，结束后可继续', async () => {
    const ctx = installCtx();
    const { sfx, audio } = await loadSfx();

    await sfx.playTheaterSfx('line');
    await sfx.playTheaterSfx('line');
    await sfx.playTheaterSfx('line');
    expect(ctx.oscs).toBe(2);

    audio.audioDirector.endSfx();
    await sfx.playTheaterSfx('line');
    expect(ctx.oscs).toBe(3);
    audio.audioDirector.endSfx();
    audio.audioDirector.endSfx();
  });
});
