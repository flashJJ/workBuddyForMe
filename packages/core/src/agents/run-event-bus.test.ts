import { describe, expect, it } from 'vitest';
import { createRunEventBus, tapRunEvents } from './run-event-bus';

describe('v1.9 M2 RunEventBus 观察总线', () => {
  it('晚订阅者先收缓冲再收实时帧；close 后读完缓冲自然结束', async () => {
    const bus = createRunEventBus<string>();
    bus.publish('a');
    bus.publish('b');

    const sub = bus.subscribe();
    const late: string[] = [];
    const drain = (async () => {
      for (;;) {
        const r = await sub.next();
        if (r.done) break;
        late.push(r.value);
      }
    })();

    bus.publish('c');
    bus.close();
    await drain;
    expect(late).toEqual(['a', 'b', 'c']);
    expect(bus.size()).toBe(3);
  });

  it('等待中的订阅者被 publish 唤醒；多订阅者互不影响', async () => {
    const bus = createRunEventBus<number>();
    const s1 = bus.subscribe();
    const s2 = bus.subscribe();
    const p1 = s1.next();
    const p2 = s2.next();
    await Promise.resolve();
    bus.publish(42);
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.value).toBe(42);
    expect(r2.value).toBe(42);
    bus.close();
  });

  it('订阅者提前 return 退订；新订阅者仍可从头读全量缓冲', async () => {
    const bus = createRunEventBus<string>();
    bus.publish('first');
    const gone = bus.subscribe();
    expect((await gone.next()).value).toBe('first');
    await gone.return!();
    bus.publish('second');

    const other = bus.subscribe();
    expect((await other.next()).value).toBe('first');
    expect((await other.next()).value).toBe('second');
    bus.close();
  });

  it('tapRunEvents：owner 消费帧被广播；终态关闭总线且返回值透传', async () => {
    async function* gen(): AsyncGenerator<string, number> {
      yield 'x';
      yield 'y';
      return 7;
    }
    const bus = createRunEventBus<string>();
    const sub = bus.subscribe();
    const seen: string[] = [];
    const drain = (async () => {
      for (;;) {
        const r = await sub.next();
        if (r.done) break;
        seen.push(r.value);
      }
    })();

    const owned = tapRunEvents(bus, gen());
    expect((await owned.next()).value).toBe('x');
    expect((await owned.next()).value).toBe('y');
    expect(await owned.next()).toEqual({ value: 7, done: true });
    await drain;
    expect(seen).toEqual(['x', 'y']);
  });
});
