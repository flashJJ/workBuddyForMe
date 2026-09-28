import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPermissionService } from '../services/permission-service';
import { createPendingConfirmations } from '../services/pending-confirmations';
import type { ServiceDeps } from '../services/deps';
import { createChatOrchestrator } from './chat-orchestrator';
import type { OrchestratorEvent } from './types';
import {
  drainWithDecision,
  mockTwoRounds,
  setupHitlFixture,
  teardownHitlFixture,
  type HitlFixture,
} from './chat-orchestrator-hitl.helpers';

describe('HITL 工具确认：拒绝路径（v0.6 M2）', () => {
  let fixture: HitlFixture;

  beforeEach(() => {
    fixture = setupHitlFixture();
  });

  afterEach(() => {
    teardownHitlFixture(fixture.db);
  });

  it('无 confirmations：未授权 danger 工具直接拒绝，事件序列含确认请求与工具失败', async () => {
    const { db, cipher, fetchMock, assistantId } = fixture;
    mockTwoRounds(fetchMock, '抱歉，无法抓取。');
    const deps: ServiceDeps = { db, cipher, permissions: createPermissionService({ db, cipher }) };
    const events: OrchestratorEvent[] = [];
    for await (const event of createChatOrchestrator(deps).streamChat({
      assistantId,
      content: '帮我看看这个网页',
    })) {
      events.push(event);
    }

    expect(events.map((e) => e.event)).toEqual([
      'meta',
      'tool_confirmation_required',
      'tool',
      'delta',
      'done',
    ]);
    expect(events[1]).toMatchObject({
      event: 'tool_confirmation_required',
      data: { callId: 'call-hitl', tool: 'fetch_webpage', permission: 'danger' },
    });
    expect(events[2]).toMatchObject({
      event: 'tool',
      data: { phase: 'end', callId: 'call-hitl', status: 'error' },
    });

    // 回灌给模型的是结构化拒绝结果
    const secondBody = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string);
    const toolMessage = secondBody.messages.at(-1)!;
    expect(toolMessage.role).toBe('tool');
    expect(String(toolMessage.content)).toContain('用户已拒绝');
  });

  it('confirmations 拒绝：同样走拒绝路径', async () => {
    const { db, cipher, fetchMock, assistantId } = fixture;
    mockTwoRounds(fetchMock, '好的，不抓了。');
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
      'deny',
    );

    expect(events.map((e) => e.event)).toEqual([
      'meta',
      'tool_confirmation_required',
      'tool',
      'delta',
      'done',
    ]);
    expect(events[2]).toMatchObject({
      event: 'tool',
      data: { phase: 'end', callId: 'call-hitl', status: 'error' },
    });
    const secondBody = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string);
    expect(String(secondBody.messages.at(-1)!.content)).toContain('用户已拒绝');
  });
});
