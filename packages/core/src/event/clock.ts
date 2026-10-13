/**
 * v1.7 引擎时钟抽象（时间可注入）。
 *
 * sleep：可等待的可中止延时，返回 true 表示因 abort 提前结束。
 * timeout：看门狗用的一次性定时器（独立于演出 AbortController），返回取消函数。
 *
 * WallClock 接真实 setTimeout；ManualClock 立即推进、定时器手动 flush，
 * 使 runner/director 的时序竞态（等 TTS 锁、看门狗、冷却）可确定性单测。
 */
export interface EventClock {
  now(): number;
  /** 等待 ms；signal abort 时立即 resolve(true)，正常超时 resolve(false) */
  sleep(ms: number, signal?: AbortSignal): Promise<boolean>;
  /** 一次性定时器（墙钟推进到期触发）；返回取消函数 */
  timeout(callback: () => void, ms: number): () => void;
}

export function createWallClock(): EventClock {
  return {
    now: () => Date.now(),
    sleep: (ms, signal) =>
      new Promise<boolean>((resolve) => {
        if (signal?.aborted) {
          resolve(true);
          return;
        }
        const timer = setTimeout(() => {
          signal?.removeEventListener('abort', onAbort);
          resolve(false);
        }, ms);
        const onAbort = () => {
          clearTimeout(timer);
          resolve(true);
        };
        signal?.addEventListener('abort', onAbort, { once: true });
      }),
    timeout: (callback, ms) => {
      const timer = setTimeout(callback, ms);
      return () => clearTimeout(timer);
    },
  };
}

interface ManualTimer {
  at: number;
  callback: () => void;
  cancelled: boolean;
}

/**
 * 确定性测试时钟：
 * - sleep 立即把 now 向前推 ms 并 resolve（监听 abort）；
 * - timeout 进有序队列，只有 advance(ms) 越过其触发时刻才执行。
 */
export function createManualClock(startNow = 0): EventClock & {
  advance(ms: number): void;
  pendingTimers(): number;
} {
  let now = startNow;
  const timers: ManualTimer[] = [];

  const clock: EventClock = {
    now: () => now,
    sleep: (ms, signal) =>
      new Promise<boolean>((resolve) => {
        if (signal?.aborted) {
          resolve(true);
          return;
        }
        now += ms;
        signal?.addEventListener(
          'abort',
          () => resolve(true),
          { once: true },
        );
        // 微任务让出，使调用方的 Promise 链与 abort 监听顺序与真实时钟一致
        queueMicrotask(() => resolve(false));
      }),
    timeout: (callback, ms) => {
      const timer: ManualTimer = { at: now + ms, callback, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
  };

  return {
    ...clock,
    advance(ms: number) {
      const target = now + ms;
      const due = timers
        .filter((t) => !t.cancelled && t.at <= target)
        .sort((a, b) => a.at - b.at);
      for (const t of due) {
        if (!t.cancelled) {
          now = t.at;
          t.cancelled = true; // 已触发即消费，pendingTimers 不再计数
          t.callback();
        }
      }
      now = target;
    },
    pendingTimers: () => timers.filter((t) => !t.cancelled).length,
  };
}
