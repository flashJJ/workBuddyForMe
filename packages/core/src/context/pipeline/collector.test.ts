import { describe, expect, it, vi } from 'vitest';
import { collectContext } from './collector';
import type { ContextCollectRequest, ContextSource } from './types';

const request: ContextCollectRequest = { conversationId: 'c1', goal: 'g' };

describe('collectContext（并发采集与容错）', () => {
  it('所有来源并发启动，而非逐个串行等待', async () => {
    let started = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const make = (id: ContextSource['id'], priority: number): ContextSource => ({
      id,
      priority,
      async collect() {
        started += 1;
        await gate;
        return [{ key: id, source: id, priority, text: id }];
      },
    });

    const pending = collectContext(
      [make('conversation-summary', 10), make('recent-messages', 40)],
      request,
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(started).toBe(2);
    release();
    const result = await pending;
    expect(result.fragments).toHaveLength(2);
  });

  it('单来源抛错只记 failed，其他来源片段照常返回', async () => {
    const sources: ContextSource[] = [
      {
        id: 'conversation-summary',
        priority: 10,
        async collect() {
          throw new Error('db down');
        },
      },
      {
        id: 'recent-messages',
        priority: 40,
        collect: () => [{ key: 'recent', source: 'recent-messages', priority: 40, text: '近期' }],
      },
    ];

    const result = await collectContext(sources, request);
    expect(result.fragments.map((f) => f.key)).toEqual(['recent']);
    expect(result.sources.map((s) => s.status)).toEqual(['failed', 'ok']);
    expect(result.sources[0]!.fragments).toBe(0);
  });

  it('enabled=false 记 skipped 且不调用 collect', async () => {
    const collect = vi.fn(() => []);
    const result = await collectContext(
      [{ id: 'long-term-memory', priority: 50, enabled: () => false, collect }],
      request,
    );
    expect(collect).not.toHaveBeenCalled();
    expect(result.sources[0]!.status).toBe('skipped');
    expect(result.fragments).toHaveLength(0);
  });

  it('空白片段视为无效，全空来源记 empty', async () => {
    const result = await collectContext(
      [{ id: 'active-plan', priority: 30, collect: () => [{ key: 'k', source: 'active-plan', priority: 30, text: '   ' }] }],
      request,
    );
    expect(result.sources[0]!.status).toBe('empty');
    expect(result.fragments).toHaveLength(0);
  });

  it('返回片段按来源优先级升序，同优先级保持注册顺序', async () => {
    const result = await collectContext(
      [
        { id: 'recent-messages', priority: 40, collect: () => [{ key: 'r', source: 'recent-messages', priority: 40, text: 'r' }] },
        { id: 'conversation-summary', priority: 10, collect: () => [{ key: 's1', source: 'conversation-summary', priority: 10, text: 's1' }] },
        { id: 'active-plan', priority: 30, collect: () => [{ key: 'p', source: 'active-plan', priority: 30, text: 'p' }] },
        { id: 'conversation-summary', priority: 10, collect: () => [{ key: 's2', source: 'conversation-summary', priority: 10, text: 's2' }] },
      ],
      request,
    );
    expect(result.fragments.map((f) => f.key)).toEqual(['s1', 's2', 'p', 'r']);
  });
});
