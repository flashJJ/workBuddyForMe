/**
 * v1.9 M2：协作 run 事件观察总线（进程内 fan-out）。
 *
 * 背景：v1.4 的 /events SSE 是「单订阅者拥有生命周期」模型——主会话独占消费，
 * 断线联动 abort run。舞台是只读第二客户端，要求：
 * - 不启动/不拥有 run（owner 生成器仍是唯一消费方）；
 * - 观察连接断开绝不 abort run（队列所有方在主会话）；
 * - 晚加入/重开能从本场开头续看（owner 消费过的事件全部留在 buffer）。
 *
 * 实现：owner 生成器每 yield 一帧即 publish（不阻塞 owner）；观察者各自持游标，
 * buffer 存活到 run 终态（协作有三重预算，事件量天然有界）。
 */

/** 唤醒柄：resolve + 所属集合（退订时精确摘除） */
interface WakeEntry {
  (): void;
}

export interface RunEventBus<T> {
  /** owner 侧：广播一帧（同步入 buffer 并唤醒等待中的观察者） */
  publish(event: T): void;
  /** owner 侧：终态关闭，观察者读完 buffer 后自然结束 */
  close(): void;
  /** 观察者侧：只读异步迭代器；break/return 退订，不触碰 run 生命周期 */
  subscribe(): AsyncIterableIterator<T>;
  /** 当前已缓冲帧数（观测/测试用） */
  size(): number;
}

export function createRunEventBus<T>(): RunEventBus<T> {
  const buffer: T[] = [];
  const waiters = new Set<WakeEntry>();
  let closed = false;

  return {
    publish(event) {
      buffer.push(event);
      if (waiters.size === 0) return;
      const woke = [...waiters];
      waiters.clear();
      for (const wake of woke) wake();
    },
    close() {
      if (closed) return;
      closed = true;
      const woke = [...waiters];
      waiters.clear();
      for (const wake of woke) wake();
    },
    size: () => buffer.length,
    subscribe() {
      let index = 0;
      let resolver: (() => void) | null = null;
      const wake: WakeEntry = () => {
        const r = resolver;
        resolver = null;
        r?.();
      };
      const waitForWake = (): Promise<void> =>
        new Promise((resolve) => {
          resolver = resolve;
          waiters.add(wake);
        });
      const iterator: AsyncIterableIterator<T> = {
        [Symbol.asyncIterator]() {
          return iterator;
        },
        async next() {
          // 被唤醒但本订阅者游标已到末尾（多观察者竞争）时继续等，不误报终态
          while (index >= buffer.length) {
            if (closed) return { value: undefined, done: true };
            await waitForWake();
          }
          return { value: buffer[index++]!, done: false };
        },
        return() {
          waiters.delete(wake);
          resolver = null;
          return Promise.resolve({ value: undefined, done: true });
        },
      };
      return iterator;
    },
  };
}

/**
 * owner 生成器包装：每产出一帧先广播给观察者再 yield 给 owner；
 * 正常返回/抛错/abort 都关总线。事件对 owner 与观察者严格同序。
 */
export async function* tapRunEvents<T, R>(
  bus: Pick<RunEventBus<T>, 'publish' | 'close'>,
  gen: AsyncGenerator<T, R>,
): AsyncGenerator<T, R> {
  try {
    let result: IteratorResult<T, R>;
    while (!(result = await gen.next()).done) {
      bus.publish(result.value);
      yield result.value;
    }
    return result.value;
  } finally {
    bus.close();
  }
}
