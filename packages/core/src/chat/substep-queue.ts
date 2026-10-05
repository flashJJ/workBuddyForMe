/**
 * v0.8：工具执行期间的子步骤推送队列。
 * 工具 run() 内的 onSubstep 回调与 async generator 的 yield 不在同一协程，
 * 用「容量无限 + 关闭约定」的异步队列桥接：执行 promise 终态时 close()。
 */
export interface SubstepQueue<T> {
  push(value: T): void;
  close(): void;
  next(): Promise<{ done: true } | { done: false; value: T }>;
}

export function createSubstepQueue<T>(): SubstepQueue<T> {
  const items: T[] = [];
  let waiter: (() => void) | null = null;
  let closed = false;

  return {
    push(value) {
      items.push(value);
      if (waiter) {
        const resolve = waiter;
        waiter = null;
        resolve();
      }
    },
    close() {
      closed = true;
      if (waiter) {
        const resolve = waiter;
        waiter = null;
        resolve();
      }
    },
    next() {
      if (items.length > 0) {
        return Promise.resolve({ done: false as const, value: items.shift()! });
      }
      if (closed) return Promise.resolve({ done: true as const });
      return new Promise<{ done: true } | { done: false; value: T }>((resolve) => {
        waiter = () => {
          if (items.length > 0) resolve({ done: false, value: items.shift()! });
          else resolve({ done: true });
        };
      });
    },
  };
}
