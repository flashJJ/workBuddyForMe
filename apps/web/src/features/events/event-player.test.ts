import { describe, expect, it, vi } from 'vitest';
import type { PetPerformanceEvent } from '@wbfm/shared/pet';
import { EventPlayer, type EventPlayerControllerLike, type EventPlayerTimers } from './event-player';
import { EVENT_FX_DURATION_MS } from './fx-registry';

interface FakeClock {
  timers: EventPlayerTimers;
  advance: (ms: number) => void;
}

function makeClock(start = 5000): FakeClock {
  let now = start;
  interface Entry {
    fn: () => void;
    at: number;
  }
  const pending = new Map<number, Entry>();
  let seq = 1;
  return {
    timers: {
      now: () => now,
      setTimeout: (fn, ms) => {
        const id = seq;
        seq += 1;
        pending.set(id, { fn, at: now + ms });
        return id;
      },
      clearTimeout: (id) => void pending.delete(id),
    },
    advance(ms) {
      now += ms;
      for (const [id, entry] of [...pending]) {
        if (entry.at <= now) {
          pending.delete(id);
          entry.fn();
        }
      }
    },
  };
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

interface Harness {
  player: EventPlayer;
  controller: ReturnType<typeof makeController>;
  relayed: PetPerformanceEvent[];
  warnings: Array<{ code: string; detail?: unknown }>;
  clock: FakeClock;
  speak: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
}

function makePlayer(speechBridge: unknown): Harness {
  const clock = makeClock();
  const controller = makeController();
  const relayed: PetPerformanceEvent[] = [];
  const warnings: Array<{ code: string; detail?: unknown }> = [];
  const speak = vi.fn();
  const restore = vi.fn();
  const player = new EventPlayer({
    getController: () => controller,
    resolveLine: (key) => (key === 'event.missing' ? '' : `文案:${key}`),
    speech: (speechBridge ? { speak } : null) as never,
    restoreBaseline: restore,
    relayPet: (event) => relayed.push(event),
    onWarn: (code, detail) => warnings.push({ code, detail }),
    timers: clock.timers,
  });
  return { player, controller, relayed, warnings, clock, speak, restore };
}

describe('EventPlayer 视觉指令', () => {
  it('常驻表情走 setExpression + 桌宠中继，首条指令置 playing', () => {
    const h = makePlayer(null);
    expect(h.player.getSnapshot().playing).toBe(false);
    h.player.expression('joy');
    expect(h.controller.calls).toEqual(['expr:joy']);
    expect(h.relayed).toContainEqual({ kind: 'expression', tag: 'joy' });
    expect(h.player.getSnapshot().playing).toBe(true);
  });

  it('带时长表情走 flashExpression', () => {
    const h = makePlayer(null);
    h.player.expression('smirk', 900);
    expect(h.controller.calls).toEqual(['flash:smirk:900']);
  });

  it('motion(tap) 映射 controller.tap；gaze 越界/非有限值钳制', () => {
    const h = makePlayer(null);
    h.player.motion('tap');
    h.player.gaze(2, -3);
    h.player.gaze(Number.POSITIVE_INFINITY, 0.4);
    expect(h.controller.calls).toEqual(['tap', 'gaze:1,-1', 'gaze:0,0.4']);
  });

  it('fx 入视图态，注册时长到期自动摘除（同类连发 key 不同）', () => {
    const h = makePlayer(null);
    h.player.fx('hearts');
    h.player.fx('hearts');
    const fx = h.player.getSnapshot().fx;
    expect(fx.map((f) => f.id)).toEqual(['hearts', 'hearts']);
    expect(fx[0]!.key).not.toBe(fx[1]!.key);
    h.clock.advance(EVENT_FX_DURATION_MS.hearts - 1);
    expect(h.player.getSnapshot().fx).toHaveLength(2);
    h.clock.advance(1);
    expect(h.player.getSnapshot().fx).toHaveLength(0);
  });

  it('spatial 在主窗 no-op（不抛错、不中继）', () => {
    const h = makePlayer(null);
    h.player.spatial('hop');
    expect(h.controller.calls).toEqual([]);
    expect(h.relayed).toEqual([]);
    expect(h.player.getSnapshot().playing).toBe(true);
  });

  it('控制器为 null 时视觉指令静默，桌宠中继照常', () => {
    const clock = makeClock();
    const relayed: PetPerformanceEvent[] = [];
    const player = new EventPlayer({
      getController: () => null,
      resolveLine: (k) => k,
      speech: null,
      restoreBaseline: () => undefined,
      relayPet: (e) => relayed.push(e),
      timers: clock.timers,
    });
    expect(() => {
      player.expression('joy');
      player.motion('tap');
      player.gaze(0, 0);
    }).not.toThrow();
    expect(relayed).toContainEqual({ kind: 'expression', tag: 'joy' });
  });
});

describe('EventPlayer speech', () => {
  it('出声台词：气泡 + 桌宠字幕中继 + 调语音桥', async () => {
    const h = makePlayer('bridge');
    h.speak.mockResolvedValue(undefined);
    const ac = new AbortController();
    const pending = h.player.speech('event.greet', true, ac.signal);
    await Promise.resolve(); // 语音桥 mock 落定，最短展示定时器入列
    h.clock.advance(1200);
    await pending;
    expect(h.speak).toHaveBeenCalledWith('文案:event.greet', ac.signal);
    expect(h.player.getSnapshot().subtitle).toBe('文案:event.greet');
    expect(h.relayed).toContainEqual({ kind: 'subtitle', text: '文案:event.greet' });
  });

  it('tts=false 不调语音桥；纯气泡也保证最短展示 1200ms', async () => {
    const h = makePlayer(null);
    const ac = new AbortController();
    const pending = h.player.speech('event.greet', false, ac.signal);
    let done = false;
    void pending.then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);
    h.clock.advance(1199);
    await Promise.resolve();
    expect(done).toBe(false);
    h.clock.advance(1);
    await pending;
    expect(done).toBe(true);
    expect(h.speak).not.toHaveBeenCalled();
  });

  it('缺台词键告警且不出声、不中继空字幕之外的内容', async () => {
    const h = makePlayer(null);
    const pending = h.player.speech('event.missing', true, new AbortController().signal);
    h.clock.advance(1200); // 无语音桥：最短展示定时器同步入列
    await pending;
    expect(h.warnings).toContainEqual({ code: 'event.line.missing', detail: 'event.missing' });
    expect(h.speak).not.toHaveBeenCalled();
    expect(h.player.getSnapshot().subtitle).toBeNull();
  });

  it('语音桥抛错时吞掉异常并告警，气泡最短展示照常', async () => {
    const h = makePlayer('bridge');
    h.speak.mockRejectedValue(new Error('boom'));
    const pending = h.player.speech('event.greet', true, new AbortController().signal);
    await Promise.resolve(); // rejection 落定后进入最短展示等待
    h.clock.advance(1200);
    await pending;
    expect(h.warnings.some((w) => w.code === 'event.speech.failed')).toBe(true);
    expect(h.player.getSnapshot().subtitle).toBe('文案:event.greet');
  });

  it('abort 后立即返回，不再等待最短展示', async () => {
    const h = makePlayer('bridge');
    const ac = new AbortController();
    h.speak.mockImplementation((_t: string, signal: AbortSignal) => {
      return new Promise<void>((resolve) => {
        signal.addEventListener('abort', () => resolve(), { once: true });
      });
    });
    const pending = h.player.speech('event.greet', true, ac.signal);
    ac.abort();
    await pending;
    h.clock.advance(5000);
    expect(h.player.getSnapshot().subtitle).toBe('文案:event.greet');
  });
});

describe('EventPlayer release', () => {
  it('统一释放：视线回中、桌宠 idle、基线交还、字幕/fx 清空、定时器清理', () => {
    const h = makePlayer(null);
    h.player.expression('joy');
    h.player.fx('sparkle');
    h.player.release();

    expect(h.controller.calls.at(-1)).toBe('gaze:0,0');
    expect(h.restore).toHaveBeenCalledOnce();
    expect(h.relayed).toContainEqual({ kind: 'state', state: 'idle' });
    expect(h.relayed).toContainEqual({ kind: 'subtitle', text: '' });
    const view = h.player.getSnapshot();
    expect(view).toEqual({ playing: false, subtitle: null, fx: [] });

    // fx 定时器已清：推进时间不再触发摘除回调（无副作用即通过）
    expect(() => h.clock.advance(5000)).not.toThrow();
    expect(h.player.getSnapshot().fx).toEqual([]);
  });

  it('视图订阅：变更时通知，release 后收到终态', () => {
    const h = makePlayer(null);
    const snaps: boolean[] = [];
    const off = h.player.subscribe(() => snaps.push(h.player.getSnapshot().playing));
    h.player.expression('joy');
    h.player.release();
    off();
    expect(snaps).toEqual([true, false]);
  });
});
