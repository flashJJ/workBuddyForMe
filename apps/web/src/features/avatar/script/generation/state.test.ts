import { describe, expect, it } from 'vitest';
import type { Scene } from '@wbfm/shared/schemas';
import {
  enqueueScene,
  estimateTokens,
  hasCapacity,
  localDateKey,
  resolveState,
  resolveUsage,
} from './state';

const scene = (id: string): Scene => ({
  id,
  triggers: [],
  priority: 2,
  cooldownMs: 0,
  interrupt: 'all',
  beats: [],
});

describe('生成用量与队列（P8.3）', () => {
  it('跨天清零；坏数据回落空状态', () => {
    const state = resolveState(
      { date: '2000-01-01', calls: 2, tokens: 100, scenes: [scene('gen.old')] },
      '2026-11-13',
    );
    expect(state).toEqual({ date: '2026-11-13', calls: 0, tokens: 0, scenes: [] });
    expect(resolveState(null, '2026-11-13').calls).toBe(0);
    expect(resolveState({ date: '2026-11-13', calls: -1, tokens: 'x' }, '2026-11-13')).toMatchObject({
      calls: 0,
      tokens: 0,
    });
  });

  it('日期键使用本地时区', () => {
    expect(localDateKey(new Date(2026, 10, 13, 23, 59))).toBe('2026-11-13');
  });

  it('容量按调用数与估算 token 同时判断', () => {
    const usage = resolveUsage({ date: 'd', calls: 2, tokens: 0, scenes: [] });
    expect(hasCapacity(usage)).toBe(true);
    expect(hasCapacity({ ...usage, calls: usage.callLimit })).toBe(false);
    expect(hasCapacity({ ...usage, tokens: usage.tokenLimit })).toBe(false);
    expect(estimateTokens('12345')).toBe(3);
  });

  it('入队去重并裁到上限', () => {
    let queue: Scene[] = [];
    for (let i = 0; i < 8; i += 1) queue = enqueueScene(queue, scene(`gen.${i}`));
    expect(queue).toHaveLength(6);
    expect(queue[0]?.id).toBe('gen.7');

    const replaced = enqueueScene(queue, scene('gen.3'));
    expect(replaced[0]?.id).toBe('gen.3');
    expect(replaced.filter((item) => item.id === 'gen.3')).toHaveLength(1);
  });
});
