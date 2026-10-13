import { describe, expect, it } from 'vitest';
import { makeContext, makeDef, makeDirectorHarness } from './director-harness';

describe('EventDirector 仲裁与队列', () => {
  it('ignore：忙时被拒绝', () => {
    const h = makeDirectorHarness();
    h.director.trigger(makeDef({ id: 'ev.current', priority: 2 }), makeContext());
    expect(h.director.trigger(makeDef({ id: 'ev.later', priority: 3, interruptPolicy: 'ignore' }), makeContext())).toMatchObject({
      kind: 'suppressed', reason: 'ignored',
    });
  });

  it('replaceLowerPriority：高优先级抢占、同级排队', () => {
    const h = makeDirectorHarness();
    h.director.trigger(makeDef({ id: 'ev.current', priority: 2 }), makeContext());
    expect(h.director.trigger(
      makeDef({ id: 'ev.high', priority: 3, interruptPolicy: 'replaceLowerPriority' }), makeContext(),
    ).kind).toBe('admitted');
    expect(h.runners[0]!.interrupts).toEqual(['higher_priority']);

    const h2 = makeDirectorHarness();
    h2.director.trigger(makeDef({ id: 'ev.cur2', priority: 3 }), makeContext());
    expect(h2.director.trigger(
      makeDef({ id: 'ev.same', priority: 3, interruptPolicy: 'replaceLowerPriority' }), makeContext(),
    )).toMatchObject({ kind: 'queued', position: 1 });
    expect(h2.director.queuedCount()).toBe(1);
  });

  it('replace：无视优先级抢占', () => {
    const h = makeDirectorHarness();
    h.director.trigger(makeDef({ id: 'ev.current', priority: 3 }), makeContext());
    expect(h.director.trigger(
      makeDef({ id: 'ev.any', priority: 1, interruptPolicy: 'replace' }), makeContext(),
    ).kind).toBe('admitted');
    expect(h.runners[0]!.interrupts).toEqual(['higher_priority']);
  });

  it('FIFO：当前结束后按序补位', async () => {
    const h = makeDirectorHarness();
    h.director.trigger(makeDef({ id: 'ev.a', priority: 3 }), makeContext());
    h.director.trigger(makeDef({ id: 'ev.b', priority: 2, interruptPolicy: 'replaceLowerPriority' }), makeContext());
    h.director.trigger(makeDef({ id: 'ev.c', priority: 1, interruptPolicy: 'replaceLowerPriority' }), makeContext());
    expect(h.director.queuedCount()).toBe(2);

    h.runners[0]!.settle('played');
    await h.flush();
    expect(h.createdFor).toEqual(['ev.a', 'ev.b']);

    h.runners[1]!.settle('played');
    await h.flush();
    expect(h.createdFor).toEqual(['ev.a', 'ev.b', 'ev.c']);
  });

  it('队满 4：同级丢弃；更高优先级挤掉队中最低（被挤记 queue_full）', () => {
    const h = makeDirectorHarness();
    h.director.trigger(makeDef({ id: 'ev.cur', priority: 3 }), makeContext());
    for (const id of ['ev.q1', 'ev.q2', 'ev.q3', 'ev.q4']) {
      expect(h.director.trigger(
        makeDef({ id, priority: 2, interruptPolicy: 'replaceLowerPriority' }), makeContext(),
      ).kind).toBe('queued');
    }
    expect(h.director.trigger(
      makeDef({ id: 'ev.drop', priority: 1, interruptPolicy: 'replaceLowerPriority' }), makeContext(),
    )).toMatchObject({ kind: 'suppressed', reason: 'queue_full' });

    expect(h.director.trigger(
      makeDef({ id: 'ev.vip', priority: 3, interruptPolicy: 'replaceLowerPriority' }), makeContext(),
    ).kind).toBe('queued');
    expect(h.director.queuedCount()).toBe(4);
  });

  it('notifyConvStart：清队列（记 suppressed）并打断当前', () => {
    const h = makeDirectorHarness();
    h.director.trigger(makeDef({ id: 'ev.cur', priority: 3 }), makeContext());
    h.director.trigger(makeDef({ id: 'ev.q1', priority: 2, interruptPolicy: 'replaceLowerPriority' }), makeContext());
    h.director.notifyConvStart();
    expect(h.runners[0]!.interrupts).toContain('conv_start');
    expect(h.director.queuedCount()).toBe(0);
    expect(h.usage.stats(0).suppressed).toBeGreaterThanOrEqual(1);
  });

  it('补位时 CONV 上锁：排队项 conv_locked 丢弃', async () => {
    const h = makeDirectorHarness();
    h.director.trigger(makeDef({ id: 'ev.cur', priority: 3 }), makeContext());
    h.director.trigger(makeDef({ id: 'ev.qconv', priority: 2, interruptPolicy: 'replaceLowerPriority' }), makeContext());
    h.gates.conv = true;
    h.runners[0]!.settle('played');
    await h.flush();
    expect(h.director.queuedCount()).toBe(0);
    expect(h.usage.stats(0).suppressed).toBeGreaterThanOrEqual(1);
  });

  it('补位时出口消失：排队项 no_outlet 丢弃', async () => {
    const h = makeDirectorHarness();
    h.director.trigger(makeDef({ id: 'ev.cur2', priority: 3 }), makeContext());
    h.director.trigger(makeDef({ id: 'ev.qout', priority: 2, interruptPolicy: 'replaceLowerPriority' }), makeContext());
    h.gates.outlet = false;
    h.runners[0]!.settle('played');
    await h.flush();
    expect(h.usage.stats(0).suppressed).toBe(1);
  });

  it('补位时进入勿扰：排队项 quiet_hours 丢弃', async () => {
    const h = makeDirectorHarness();
    h.director.trigger(makeDef({ id: 'ev.cur', priority: 3 }), makeContext({ hour: 10 }));
    h.director.trigger(makeDef({ id: 'ev.q', priority: 2, interruptPolicy: 'replaceLowerPriority' }), makeContext({ hour: 23 }));
    h.runners[0]!.settle('played');
    await h.flush();
    expect(h.director.queuedCount()).toBe(0);
    expect(h.usage.stats(0).suppressed).toBe(1);
  });

  it('skipped/interrupted 终态如实记录原因', async () => {
    const h = makeDirectorHarness();
    h.director.trigger(makeDef({ id: 'ev.cur' }), makeContext());
    h.runners[0]!.settle('interrupted', 'conv_start');
    await h.flush();
    const stats = h.usage.stats(0);
    expect(stats.interrupted).toBe(1);
    expect(stats.played).toBe(0);
  });
});
