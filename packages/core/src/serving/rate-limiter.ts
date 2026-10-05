/**
 * v0.9 公开 API 速率限制器：
 * - 每 endpoint 固定 60s 窗口计数（配额随端点配置可逐次变化，窗口内以最新配额判定）；
 * - 纯内存、单进程；Map 插入序实现 LRU，上限防异常端点数量撑爆内存；
 * - 被 LRU 淘汰的端点下次请求按新窗口处理（本地调用方可接受的保守放宽）。
 */
export interface RateLimitDecision {
  allowed: boolean;
  /** 拒绝时距窗口重置的秒数（Retry-After），允许时为 0 */
  retryAfterSec: number;
}

interface WindowCounter {
  /** 窗口起点（epoch ms） */
  startedAt: number;
  count: number;
}

export interface RateLimiterOptions {
  windowMs?: number;
  maxKeys?: number;
  now?: () => number;
}

export interface RateLimiter {
  check(endpointId: string, limitPerMin: number): RateLimitDecision;
  /** 测试/观测用 */
  size(): number;
}

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_KEYS = 10_000;

export function createRateLimiter(options: RateLimiterOptions = {}): RateLimiter {
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const maxKeys = options.maxKeys ?? DEFAULT_MAX_KEYS;
  const clock = options.now ?? (() => Date.now());
  // Map 迭代序 = 插入/最近访问序（get 时 delete+set 刷新），天然 LRU
  const windows = new Map<string, WindowCounter>();

  function evictIfNeeded(): void {
    while (windows.size >= maxKeys) {
      const oldest = windows.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      windows.delete(oldest);
    }
  }

  return {
    check(endpointId, limitPerMin) {
      const now = clock();
      let counter = windows.get(endpointId);
      if (!counter || now - counter.startedAt >= windowMs) {
        counter = { startedAt: now, count: 0 };
        evictIfNeeded();
        windows.set(endpointId, counter);
      } else {
        // 刷新 LRU 顺序
        windows.delete(endpointId);
        windows.set(endpointId, counter);
      }
      counter.count += 1;
      if (counter.count <= limitPerMin) return { allowed: true, retryAfterSec: 0 };
      const retryAfterSec = Math.max(1, Math.ceil((counter.startedAt + windowMs - now) / 1000));
      return { allowed: false, retryAfterSec };
    },
    size() {
      return windows.size;
    },
  };
}
