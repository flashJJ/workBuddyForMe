import { describe, expect, it } from 'vitest';
import type { ToolCall } from '@wbfm/ai';
import { takeParallelRun } from './parallel-batch';

function call(name: string, args: Record<string, unknown> = {}, id = `${name}-${Math.random()}`): ToolCall {
  return { id, type: 'function', function: { name, arguments: JSON.stringify(args) } };
}

describe('takeParallelRun：同轮联网调用并发批次', () => {
  it('连续两个不同 URL 的 fetch_webpage 进入同一批', () => {
    const calls = [call('fetch_webpage', { url: 'https://a.com' }), call('fetch_webpage', { url: 'https://b.com' })];
    expect(takeParallelRun(calls, 0)).toHaveLength(2);
  });

  it('遇到非联网工具立即截止；只有一个调用时不并发', () => {
    const calls = [call('fetch_webpage', { url: 'https://a.com' }), call('current_time'), call('fetch_webpage', { url: 'https://b.com' })];
    expect(takeParallelRun(calls, 0)).toEqual([]);
  });

  it('同一 URL 重复出现时不并行：保留连续失败降级的串行语义', () => {
    const calls = [
      call('fetch_webpage', { url: 'https://a.com' }),
      call('fetch_webpage', { url: 'https://a.com' }),
      call('web_search', { query: 'q' }),
    ];
    expect(takeParallelRun(calls, 0)).toEqual([]);
  });

  it('最多 3 个：超出部分留给下一批', () => {
    const calls = [
      call('web_search', { query: 'a' }),
      call('web_search', { query: 'b' }),
      call('web_search', { query: 'c' }),
      call('web_search', { query: 'd' }),
    ];
    expect(takeParallelRun(calls, 0)).toHaveLength(3);
    expect(takeParallelRun(calls, 3)).toEqual([]);
  });
});
