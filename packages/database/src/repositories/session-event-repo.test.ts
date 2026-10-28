import { describe, expect, it } from 'vitest';
import { createDatabase } from '../client';
import { createSessionEventRepository } from './session-event-repo';

describe('SessionEventRepository（v2.9 事件日志）', () => {
  it('append：同 scope 内 seq 单调；list 按 seq 升序', () => {
    const db = createDatabase(':memory:');
    const repo = createSessionEventRepository(db);
    const a = repo.append({ scope: 'chat', scopeId: 'c1', type: 'message_started', payload: { content: '你好' } });
    const b = repo.append({ scope: 'chat', scopeId: 'c1', type: 'message_completed', payload: { content: '你好呀' } });
    const c = repo.append({ scope: 'task', scopeId: 't1', type: 'run_started', payload: {} });
    expect([a.seq, b.seq, c.seq]).toEqual([1, 2, 1]);

    const list = repo.list('chat', 'c1');
    expect(list.map((event) => event.type)).toEqual(['message_started', 'message_completed']);
    expect(list[1]!.payload).toEqual({ content: '你好呀' });
    db.close();
  });

  it('CJK 2 字词检索命中（uni-gram）', () => {
    const db = createDatabase(':memory:');
    const repo = createSessionEventRepository(db);
    repo.append({ scope: 'chat', scopeId: 'c1', type: 'message_completed', payload: { content: '复盘结论：先归档资料' } });
    repo.append({ scope: 'task', scopeId: 't1', type: 'step_started', payload: { title: '打开记事本' } });

    expect(repo.search('复盘').map((event) => event.scope)).toEqual(['chat']);
    expect(repo.search('记事').map((event) => event.scope)).toEqual(['task']);
    expect(repo.search('暗号')).toEqual([]);
    expect(repo.search('，')).toEqual([]);
    db.close();
  });

  it('scope/时间筛选与保留清理', () => {
    const db = createDatabase(':memory:');
    const repo = createSessionEventRepository(db);
    repo.append({
      scope: 'chat',
      scopeId: 'c1',
      type: 'old',
      payload: {},
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    repo.append({ scope: 'chat', scopeId: 'c1', type: 'fresh', payload: {} });

    const filtered = repo.search('old', { scope: 'task' });
    expect(filtered).toEqual([]);
    expect(repo.purgeBefore(Date.parse('2026-06-01T00:00:00.000Z'))).toBe(1);
    expect(repo.list('chat', 'c1').map((event) => event.type)).toEqual(['fresh']);
    // 清理后 FTS 仍可检索且不报错
    expect(repo.search('fresh')).toHaveLength(1);
    db.close();
  });
});
