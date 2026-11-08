import { describe, expect, it } from 'vitest';
import type { Message } from '@wbfm/shared/types';
import { applyMemoryNotices } from '../use-chat-session-helpers';

function message(id: string, role: Message['role'], noticeIds: string[] = []): Message {
  const base = { id, role, content: '' } as Message;
  return noticeIds.length
    ? { ...base, memoryNotices: noticeIds.map((nid) => ({ id: nid, content: nid })) }
    : base;
}

describe('applyMemoryNotices（v2.28 P1）', () => {
  it('挂到最后一条助手消息，并只保留 2 条', () => {
    const prev = [message('u1', 'user'), message('a1', 'assistant')];
    const next = applyMemoryNotices(prev, [
      { id: 'm1', content: '花生过敏' },
      { id: 'm2', content: '忌口海鲜' },
      { id: 'm3', content: '不要熬夜' },
    ]);
    expect(next?.[1]?.memoryNotices?.map((n) => n.id)).toEqual(['m1', 'm2']);
  });

  it('同一会话内已提示过的约束不再重复', () => {
    const prev = [
      message('a1', 'assistant', ['m1']),
      message('u2', 'user'),
      message('a2', 'assistant'),
    ];
    const next = applyMemoryNotices(prev, [{ id: 'm1', content: '花生过敏' }]);
    expect(next).toBe(prev);
    expect(next?.[2]?.memoryNotices).toBeUndefined();
  });

  it('无提示或空消息时保持原引用', () => {
    const prev = [message('a1', 'assistant')];
    expect(applyMemoryNotices(prev, undefined)).toBe(prev);
    expect(applyMemoryNotices(prev, [])).toBe(prev);
    expect(applyMemoryNotices(null, [{ id: 'm1', content: 'x' }])).toBeNull();
  });
});
