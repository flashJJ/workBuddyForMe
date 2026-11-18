import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createConversationRepository, createMessageRepository } from '@wbfm/database';
import type { ServiceDeps } from '../../services/base/deps';
import { createTestDb, type TestDb } from '../runner/agent-run-test-harness';
import { buildTaskContextBlock } from './task-context';

describe('buildTaskContextBlock（v4.7 任务上下文装配）', () => {
  let testDb: TestDb;
  let deps: ServiceDeps;

  beforeEach(() => {
    testDb = createTestDb();
    testDb.db.exec(
      "INSERT INTO assistants(id,name,created_at,updated_at) VALUES('a1','测试助手','t','t')",
    );
    deps = { db: testDb.db } as ServiceDeps;
  });

  afterEach(() => {
    testDb.cleanup();
  });

  it('无会话直接返回 null', async () => {
    expect(await buildTaskContextBlock(deps, { conversationId: null, goal: 'g', assistantId: 'a1' })).toBeNull();
  });

  it('会话不存在时静默返回 null（不阻断任务）', async () => {
    expect(await buildTaskContextBlock(deps, { conversationId: 'nope', goal: 'g', assistantId: 'a1' })).toBeNull();
  });

  it('装配摘要 + 近期对话，且摘要先于近期对话（高密度优先）', async () => {
    const conversations = createConversationRepository(testDb.db);
    const conversation = conversations.create({ assistantId: 'a1', title: '职业规划' });
    conversations.updateSummary(conversation.id, '用户在准备转岗，目标是大模型应用方向。', 0);
    const messages = createMessageRepository(testDb.db);
    messages.add({ conversationId: conversation.id, role: 'user', status: 'completed', content: '我最近在准备转岗' });
    messages.add({ conversationId: conversation.id, role: 'assistant', status: 'completed', content: '可以，先从简历梳理开始。' });

    const block = await buildTaskContextBlock(deps, {
      conversationId: conversation.id,
      goal: '帮我规划接下来三个月',
      assistantId: 'a1',
    });

    expect(block).toBeTruthy();
    expect(block).toContain('【会话摘要】');
    expect(block).toContain('大模型应用方向');
    expect(block).toContain('【近期对话】');
    expect(block).toContain('用户：我最近在准备转岗');
    expect(block).toContain('助手：可以，先从简历梳理开始。');
    expect(block!.indexOf('【会话摘要】')).toBeLessThan(block!.indexOf('【近期对话】'));
  });

  it('近期对话只取最近 N 条，且单条超长时截断', async () => {
    const conversations = createConversationRepository(testDb.db);
    const conversation = conversations.create({ assistantId: 'a1', title: 't' });
    const messages = createMessageRepository(testDb.db);
    for (let i = 0; i < 10; i += 1) {
      messages.add({ conversationId: conversation.id, role: 'user', status: 'completed', content: `第${i}条` });
    }
    messages.add({ conversationId: conversation.id, role: 'user', status: 'completed', content: '长'.repeat(900) });

    const block = await buildTaskContextBlock(deps, {
      conversationId: conversation.id,
      goal: 'g',
      assistantId: 'a1',
    });
    expect(block).toContain('第9条');
    expect(block).not.toContain('第0条');
    expect(block).toContain('…');
  });

  it('受 token 预算约束：超限时截断尾部（记忆/低优先级先丢）', async () => {
    const conversations = createConversationRepository(testDb.db);
    const conversation = conversations.create({ assistantId: 'a1', title: 't' });
    conversations.updateSummary(conversation.id, '关键结论：预算是 8MB。', 0);
    const messages = createMessageRepository(testDb.db);
    messages.add({ conversationId: conversation.id, role: 'user', status: 'completed', content: '细节'.repeat(200) });

    const block = await buildTaskContextBlock(deps, {
      conversationId: conversation.id,
      goal: 'g',
      assistantId: 'a1',
      budgetTokens: 60,
    });
    expect(block).toContain('【会话摘要】');
    expect(block).toContain('关键结论');
  });
});

