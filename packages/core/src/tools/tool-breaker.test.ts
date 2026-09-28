import { describe, expect, it } from 'vitest';
import { createToolBreaker } from './tool-breaker';

describe('工具熔断器', () => {
  it('连续失败达到阈值→trip；冷却后半开放行；半开成功→closed', () => {
    let now = 1_000;
    const breaker = createToolBreaker({
      threshold: 3,
      cooldownMs: 1_000,
      now: () => now,
    });

    // 2 次失败未到阈值，仍在 closed
    breaker.recordResult('fetch_webpage', false);
    breaker.recordResult('fetch_webpage', false);
    expect(breaker.isTripped('fetch_webpage')).toBe(false);

    // 第 3 次失败 → open
    breaker.recordResult('fetch_webpage', false);
    expect(breaker.isTripped('fetch_webpage')).toBe(true);

    // cooldown 内：仍熔断
    now += 500;
    expect(breaker.isTripped('fetch_webpage')).toBe(true);

    // cooldown 到期：转 half-open，放行一次
    now += 600;
    expect(breaker.isTripped('fetch_webpage')).toBe(false);

    // half-open 成功 → closed
    breaker.recordResult('fetch_webpage', true);
    expect(breaker.isTripped('fetch_webpage')).toBe(false);
    expect(breaker.listTripped()).toHaveLength(0);
  });

  it('半开失败→立即重新熔断', () => {
    let now = 0;
    const breaker = createToolBreaker({
      threshold: 2,
      cooldownMs: 100,
      now: () => now,
    });

    breaker.recordResult('t', false);
    breaker.recordResult('t', false);
    expect(breaker.isTripped('t')).toBe(true);

    // cooldown 到期，half-open 放行一次
    now += 200;
    expect(breaker.isTripped('t')).toBe(false);
    breaker.recordResult('t', false);
    // 立即重新 trip，新 cooldown 从 now 起算
    expect(breaker.isTripped('t')).toBe(true);
  });

  it('成功重置失败计数', () => {
    const breaker = createToolBreaker({
      threshold: 3,
      cooldownMs: 1_000,
      now: () => 0,
    });
    breaker.recordResult('t', false);
    breaker.recordResult('t', false);
    breaker.recordResult('t', true);
    expect(breaker.isTripped('t')).toBe(false);
    // 失败计数被重置，再连续 2 次不应 trip
    breaker.recordResult('t', false);
    breaker.recordResult('t', false);
    expect(breaker.isTripped('t')).toBe(false);
  });

  it('reset 清空状态', () => {
    const breaker = createToolBreaker({
      threshold: 1,
      cooldownMs: 1_000,
      now: () => 0,
    });
    breaker.recordResult('a', false);
    expect(breaker.isTripped('a')).toBe(true);
    breaker.reset('a');
    expect(breaker.isTripped('a')).toBe(false);
    expect(breaker.listTripped()).toHaveLength(0);
  });

  it('listTripped 仅列出非 closed', () => {
    let now = 0;
    const breaker = createToolBreaker({
      threshold: 1,
      cooldownMs: 1_000,
      now: () => now,
    });
    breaker.recordResult('a', false);
    breaker.recordResult('b', false);
    expect(breaker.listTripped()).toHaveLength(2);
    breaker.reset('a');
    expect(breaker.listTripped()).toHaveLength(1);
    // b 仍在 list
    expect(breaker.listTripped()[0]!.name).toBe('b');
    // 进入 half-open 后仍列入（半开也属异常态，需要展示）
    now += 2_000;
    breaker.isTripped('b');
    expect(breaker.listTripped()[0]!.status).toBe('half-open');
  });

  it('默认参数：threshold=3 / cooldown=5min 来自 shared 常量', () => {
    const breaker = createToolBreaker();
    // 直接行为断言：未注入 threshold 时，3 次连续失败即 trip
    breaker.recordResult('t', false);
    breaker.recordResult('t', false);
    expect(breaker.isTripped('t')).toBe(false);
    breaker.recordResult('t', false);
    expect(breaker.isTripped('t')).toBe(true);
  });
});
