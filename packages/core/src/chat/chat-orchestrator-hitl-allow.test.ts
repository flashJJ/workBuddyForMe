import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAssistantsService } from '../services/assistant-service';
import { createPermissionService } from '../services/permission-service';
import { createPendingConfirmations } from '../services/pending-confirmations';
import type { ServiceDeps } from '../services/deps';
import { createChatOrchestrator } from './chat-orchestrator';
import type { OrchestratorEvent } from './types';
import {
  answerSse,
  drainWithDecision,
  mockTwoRounds,
  setupHitlFixture,
  teardownHitlFixture,
  type HitlFixture,
} from './chat-orchestrator-hitl.helpers';

describe('HITL 工具确认：放行路径（v0.6 M2）', () => {
  let fixture: HitlFixture;

  beforeEach(() => {
    fixture = setupHitlFixture();
  });

  afterEach(() => {
    teardownHitlFixture(fixture.db);
  });

  it('confirmations 允许：工具真实执行（SSRF 拦截属执行结果而非授权拦截）', async () => {
    const { db, cipher, fetchMock, assistantId } = fixture;
    mockTwoRounds(fetchMock, '这个地址访问不了。');
    const confirmations = createPendingConfirmations();
    const deps: ServiceDeps = {
      db,
      cipher,
      permissions: createPermissionService({ db, cipher }),
      confirmations,
    };
    const events = await drainWithDecision(
      createChatOrchestrator(deps).streamChat({ assistantId, content: '帮我看看这个网页' }),
      confirmations,
      'allow',
    );

    // 允许后走正常执行路径：tool start → tool end（SSRF 拦截报错），随后第二轮回答
    expect(events.map((e) => e.event)).toEqual([
      'meta',
      'tool_confirmation_required',
      'tool',
      'tool',
      'delta',
      'done',
    ]);
    expect(events[2]).toMatchObject({
      event: 'tool',
      data: { phase: 'start', callId: 'call-hitl', tool: 'fetch_webpage' },
    });
    expect(events[3]).toMatchObject({
      event: 'tool',
      data: { phase: 'end', callId: 'call-hitl', status: 'error' },
    });
    // 执行结果是工具真实输出（SSRF 拦截文案），不是授权拒绝文案
    const endData = events[3]!.data as { resultSummary: string };
    expect(endData.resultSummary).not.toContain('用户拒绝');
    const secondBody = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string);
    expect(String(secondBody.messages.at(-1)!.content)).toContain('抓取失败');
  });

  it('已授权（grantPermission）：不触发确认事件，工具直接执行', async () => {
    const { db, cipher, fetchMock, assistantId } = fixture;
    mockTwoRounds(fetchMock, '这个地址访问不了。');
    const permissions = createPermissionService({ db, cipher });
    permissions.grantPermission('fetch_webpage', `assistant:${assistantId}`, 'allow');
    const confirmations = createPendingConfirmations();
    const deps: ServiceDeps = { db, cipher, permissions, confirmations };
    const events: OrchestratorEvent[] = [];
    for await (const event of createChatOrchestrator(deps).streamChat({
      assistantId,
      content: '帮我看看这个网页',
    })) {
      events.push(event);
    }

    expect(events.map((e) => e.event)).toEqual(['meta', 'tool', 'tool', 'delta', 'done']);
    expect(events.some((e) => e.event === 'tool_confirmation_required')).toBe(false);
    expect(confirmations.size()).toBe(0);
  });

  it('read 级工具（current_time）不受权限钩子影响', async () => {
    const { db, cipher, fetchMock, assistantId } = fixture;
    // 换装 read 工具
    createAssistantsService({ db, cipher }).update(assistantId, { enabledTools: ['current_time'] });
    const head = {
      choices: [
        {
          delta: {
            tool_calls: [
              { index: 0, id: 'call-time', type: 'function', function: { name: 'current_time', arguments: '' } },
            ],
          },
        },
      ],
    };
    const tail = {
      choices: [
        {
          delta: { tool_calls: [{ index: 0, function: { arguments: '{}' } }] },
          finish_reason: 'tool_calls',
        },
      ],
    };
    const toolSse = `data: ${JSON.stringify(head)}\n\ndata: ${JSON.stringify(tail)}\n\ndata: [DONE]\n\n`;
    fetchMock
      .mockImplementationOnce(
        () => new Response(toolSse, { headers: { 'content-type': 'text/event-stream' } }),
      )
      .mockImplementationOnce(
        () =>
          new Response(answerSse('现在是上班时间。'), {
            headers: { 'content-type': 'text/event-stream' },
          }),
      );

    const confirmations = createPendingConfirmations();
    const deps: ServiceDeps = {
      db,
      cipher,
      permissions: createPermissionService({ db, cipher }),
      confirmations,
    };
    const events: OrchestratorEvent[] = [];
    for await (const event of createChatOrchestrator(deps).streamChat({
      assistantId,
      content: '现在几点',
    })) {
      events.push(event);
    }

    expect(events.map((e) => e.event)).toEqual(['meta', 'tool', 'tool', 'delta', 'done']);
    expect(events.some((e) => e.event === 'tool_confirmation_required')).toBe(false);
    expect(events[2]).toMatchObject({ event: 'tool', data: { phase: 'end', status: 'ok' } });
  });
});
