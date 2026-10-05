import { describe, expect, it } from 'vitest';
import { createRateLimiter } from './rate-limiter';

describe('rate-limiter（v0.9 公开 API）', () => {
  it('固定窗口内超过配额拒绝并给出正数 Retry-After；窗口滚动后恢复', () => {
    let now = 100_000;
    const limiter = createRateLimiter({ now: () => now, windowMs: 60_000 });
    for (let i = 0; i < 3; i += 1) {
      expect(limiter.check('ep1', 3)).toMatchObject({ allowed: true });
    }
    const blocked = limiter.check('ep1', 3);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(blocked.retryAfterSec).toBeLessThanOrEqual(60);

    // 另一端点独立计数
    expect(limiter.check('ep2', 1)).toMatchObject({ allowed: true });

    // 窗口过期后重新计数
    now += 60_001;
    expect(limiter.check('ep1', 3)).toMatchObject({ allowed: true });
  });

  it('配额动态变化：同一窗口内以最新 limitPerMin 判定', () => {
    const now = 0;
    const limiter = createRateLimiter({ now: () => now, windowMs: 60_000 });
    expect(limiter.check('ep', 1).allowed).toBe(true);
    expect(limiter.check('ep', 1).allowed).toBe(false);
    // 端点配置放宽配额后立刻生效
    expect(limiter.check('ep', 5).allowed).toBe(true);
  });

  it('LRU 上限淘汰最久未访问端点', () => {
    const limiter = createRateLimiter({ maxKeys: 2 });
    limiter.check('a', 10);
    limiter.check('b', 10);
    // 访问 a 刷新为最近使用，插入 c 时淘汰 b
    limiter.check('a', 10);
    limiter.check('c', 10);
    expect(limiter.size()).toBe(2);
    // b 被淘汰后重新计数（保守放宽，不阻断合法调用）
    expect(limiter.check('b', 1).allowed).toBe(true);
  });
});
