import { describe, expect, it } from 'vitest';
import { assembleGroups, mapEventsToHits, type RawSearchEvent } from './map-events';

function event(partial: Partial<RawSearchEvent> & Pick<RawSearchEvent, 'type'>): RawSearchEvent {
  return {
    id: partial.id ?? 'e1',
    scopeId: partial.scopeId ?? 's1',
    type: partial.type,
    payload: partial.payload ?? {},
    createdAt: partial.createdAt ?? '2026-11-22T00:00:00.000Z',
  };
}

describe('v4.18 跨域检索映射', () => {
  it('会话消息按 messageId 去重并生成消息深链', () => {
    const hits = mapEventsToHits('chat', [
      event({
        id: 'e2',
        scopeId: 'c1',
        type: 'message_completed',
        payload: { messageId: 'm1', content: '接口版本 v2.3', role: 'assistant' },
      }),
      event({
        id: 'e1',
        scopeId: 'c1',
        type: 'message_started',
        payload: { messageId: 'm1', content: '接口版本 v2.3', role: 'assistant' },
      }),
    ]);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      domain: 'chat',
      id: 'm1',
      deepLink: '/chat?conversation=c1&message=m1',
    });
  });

  it('任务使用 runId 与目标，深链到时间线任务作用域', () => {
    const hits = mapEventsToHits('task', [
      event({
        scopeId: 'run-1',
        type: 'run_started',
        payload: { runId: 'run-1', run: { goal: '整理三份文档' } },
      }),
    ]);
    expect(hits[0]).toMatchObject({
      domain: 'task',
      id: 'run-1',
      title: '整理三份文档',
      deepLink: '/timeline?scope=task&id=run-1',
    });
  });

  it('流程带 workflowId 时直达工作流运行，缺失时回落时间线', () => {
    const [withWorkflow] = mapEventsToHits('flow', [
      event({ type: 'run_started', payload: { runId: 'r1', workflowId: 'w1' } }),
    ]);
    expect(withWorkflow?.deepLink).toBe('/flows/w1?run=r1');
    const [fallback] = mapEventsToHits('flow', [
      event({ type: 'run_started', payload: { runId: 'r2' } }),
    ]);
    expect(fallback?.deepLink).toBe('/timeline?scope=flow&id=r2');
  });

  it('会议深链到会议详情', () => {
    const [hit] = mapEventsToHits('meeting', [
      event({ scopeId: 'meeting-9', type: 'meeting_turn_start' }),
    ]);
    expect(hit?.deepLink).toBe('/meetings/meeting-9');
  });

  it('单域最多 10 条', () => {
    const events = Array.from({ length: 12 }, (_, index) =>
      event({
        id: `e${index}`,
        type: 'message_completed',
        payload: { messageId: `m${index}`, content: `消息 ${index}` },
      }),
    );
    expect(mapEventsToHits('chat', events)).toHaveLength(10);
  });

  it('单域失败不影响其他域分组', () => {
    const chatHit = mapEventsToHits('chat', [
      event({ type: 'message_completed', payload: { messageId: 'm1', content: '命中' } }),
    ]);
    const meetingHit = mapEventsToHits('meeting', [
      event({ scopeId: 'meeting-1', type: 'meeting_turn_start' }),
    ]);
    const result = assembleGroups(
      ['chat', 'task', 'flow', 'meeting'],
      [
        { status: 'fulfilled', value: chatHit },
        { status: 'rejected', reason: new Error('task down') },
        { status: 'fulfilled', value: [] },
        { status: 'fulfilled', value: meetingHit },
      ],
    );
    expect(result.failedDomains).toEqual(['task']);
    expect(result.groups.map((group) => group.domain)).toEqual(['chat', 'meeting']);
  });
});
