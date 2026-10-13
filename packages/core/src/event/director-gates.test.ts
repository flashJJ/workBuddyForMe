import { describe, expect, it } from 'vitest';
import { makeContext, makeDef, makeDirectorHarness } from './director-harness';

describe('EventDirector 准入闸门', () => {
  it('正常准入并在落幕后记录 played', async () => {
    const h = makeDirectorHarness();
    const decision = h.director.trigger(makeDef({ id: 'ev.a' }), makeContext());
    expect(decision.kind).toBe('admitted');
    h.runners[0]!.settle('played');
    await h.flush();
    expect(h.usage.stats(0).played).toBe(1);
  });

  it('CONV 占用 → blocked 且不记流水', () => {
    const h = makeDirectorHarness();
    h.gates.conv = true;
    expect(h.director.trigger(makeDef({ id: 'ev.a' }), makeContext())).toEqual({
      kind: 'blocked', reason: 'conv_locked',
    });
    const s = h.usage.stats(0);
    expect(s.played + s.suppressed).toBe(0);
  });

  it('总开关关 / 无出口', () => {
    const h1 = makeDirectorHarness({ masterEnabled: false });
    expect(h1.director.trigger(makeDef({ id: 'ev.a' }), makeContext())).toMatchObject({
      kind: 'suppressed', reason: 'master_off',
    });
    const h2 = makeDirectorHarness();
    h2.gates.outlet = false;
    expect(h2.director.trigger(makeDef({ id: 'ev.b' }), makeContext())).toMatchObject({
      kind: 'suppressed', reason: 'no_outlet',
    });
  });

  it('勿扰时段（23:00–8:00）边界', () => {
    const h = makeDirectorHarness();
    expect(h.director.trigger(makeDef({ id: 'ev.c' }), makeContext({ hour: 23 }))).toMatchObject({ reason: 'quiet_hours' });
    expect(h.director.trigger(makeDef({ id: 'ev.c' }), makeContext({ hour: 7 }))).toMatchObject({ reason: 'quiet_hours' });
    expect(h.director.trigger(makeDef({ id: 'ev.c' }), makeContext({ hour: 8 })).kind).toBe('admitted');
    const hDay = makeDirectorHarness();
    expect(hDay.director.trigger(makeDef({ id: 'ev.c' }), makeContext({ hour: 22 })).kind).toBe('admitted');
  });

  it('冷却（含频率档系数）与每日上限', () => {
    const h = makeDirectorHarness();
    h.usage.record({ eventId: 'ev.cool', playedAt: 1_000_000 - 10_000, outcome: 'played', priority: 1 });
    expect(h.director.trigger(makeDef({ id: 'ev.cool', cooldownMs: 60_000 }), makeContext())).toMatchObject({
      kind: 'suppressed', reason: 'cooldown',
    });

    // low 档 1.5 倍：标准档已放行的间隔在 low 档仍冷却
    const hLow = makeDirectorHarness({ tier: 'low' });
    hLow.usage.record({ eventId: 'ev.cool', playedAt: 1_000_000 - 70_000, outcome: 'played', priority: 1 });
    expect(hLow.director.trigger(makeDef({ id: 'ev.cool', cooldownMs: 60_000 }), makeContext())).toMatchObject({
      kind: 'suppressed', reason: 'cooldown',
    });

    // 超过冷却放行
    const h3 = makeDirectorHarness();
    h3.usage.record({ eventId: 'ev.cool2', playedAt: 1_000_000 - 61_000, outcome: 'played', priority: 1 });
    expect(h3.director.trigger(makeDef({ id: 'ev.cool2', cooldownMs: 60_000 }), makeContext()).kind).toBe('admitted');

    const hCap = makeDirectorHarness();
    hCap.usage.record({ eventId: 'ev.cap', playedAt: 1_000_000, outcome: 'played', priority: 1 });
    expect(hCap.director.trigger(makeDef({ id: 'ev.cap', maxPerDay: 1, cooldownMs: 0 }), makeContext())).toMatchObject({
      kind: 'suppressed', reason: 'daily_cap',
    });
  });

  it('默认工厂接真实 EventRunner：短剧本自动落幕并释放', async () => {
    const { EventDirector } = await import('./director');
    const { createManualClock } = await import('./clock');
    const { InMemoryEventUsageStore } = await import('./usage-store');
    const gatesState = { conv: false, tts: false, outlet: true };
    const clock = createManualClock(1_000_000);
    const usage = new InMemoryEventUsageStore({ toDateKey: () => '2026-10-13' });
    const calls: string[] = [];
    const director = new EventDirector({
      gates: {
        isConvLocked: () => gatesState.conv,
        isTtsLocked: () => gatesState.tts,
        hasOutlet: () => gatesState.outlet,
      },
      clock,
      usage,
      toDateKey: () => '2026-10-13',
      settings: { masterEnabled: true, quietStart: 23, quietEnd: 8, tier: 'standard' },
      sink: {
        expression: () => calls.push('expr'),
        motion: () => {},
        gaze: () => {},
        fx: () => {},
        spatial: () => {},
        speech: async () => {},
        release: () => calls.push('release'),
      },
    });
    expect(director.trigger(makeDef({ id: 'ev.real' }), makeContext()).kind).toBe('admitted');
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
    expect(usage.stats(0).played).toBe(1);
    expect(calls).toEqual(['expr', 'release']);
  });
});
