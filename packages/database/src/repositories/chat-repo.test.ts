import { describe, expect, it, beforeEach } from 'vitest';
import {
  createAssistantRepository,
  createConversationRepository,
  createDatabase,
  createMessageRepository,
  type DatabaseInstance,
} from '../index';

function makeAssistant(db: DatabaseInstance) {
  return createAssistantRepository(db).create({
    name: 'A',
    emoji: null,
    color: null,
    systemPrompt: '',
    temperature: 1,
    topP: 1,
    maxTokens: null,
    modelId: null,
    knowledgeBaseId: null,
    enabledTools: [],
    retrieveAlways: false,
    isBuiltin: true,
    sortOrder: 0,
  });
}

describe('conversation/message 仓储', () => {
  let db: DatabaseInstance;

  beforeEach(() => {
    db = createDatabase(':memory:');
  });

  it('会话 CRUD、默认标题、最近排序与级联', () => {
    const assistant = makeAssistant(db);
    const convos = createConversationRepository(db);
    const c1 = convos.create({ assistantId: assistant.id });
    expect(c1.title).toBe('新会话');
    const c2 = convos.create({ assistantId: assistant.id, title: '有标题' });
    convos.touch(c1.id, '2026-02-01T00:00:00.000Z');

    const list = convos.list();
    expect(list[0]!.id).toBe(c1.id);
    expect(list[1]!.id).toBe(c2.id);

    expect(convos.rename(c1.id, '改')!.title).toBe('改');
    expect(convos.delete(c2.id)).toBe(true);
  });

  it('消息写入、上下文窗口、流式回写与错误标记', () => {
    const assistant = makeAssistant(db);
    const convos = createConversationRepository(db);
    const messages = createMessageRepository(db);
    const c1 = convos.create({ assistantId: assistant.id });

    const user = messages.add({
      conversationId: c1.id,
      role: 'user',
      content: '你好',
      status: 'completed',
    });
    const assistantMsg = messages.add({
      conversationId: c1.id,
      role: 'assistant',
      content: '',
      status: 'streaming',
    });
    messages.complete(assistantMsg.id, '你好，有什么可以帮你？', {
      promptTokens: 10,
      completionTokens: 8,
      totalTokens: 18,
    });

    const saved = messages.findById(assistantMsg.id)!;
    expect(saved.status).toBe('completed');
    expect(saved.totalTokens).toBe(18);

    const errMsg = messages.add({
      conversationId: c1.id,
      role: 'assistant',
      content: '',
      status: 'streaming',
    });
    messages.markError(errMsg.id, 'PROVIDER_ERROR', '上游故障');

    const context = messages.lastN(c1.id, 10);
    expect(context.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(context.every((m) => m.status !== 'error')).toBe(true);
    expect(messages.listByConversation(c1.id)).toHaveLength(3);
    expect(user.id).toBeTruthy();
  });

  it('删除助手 → 会话 → 消息外键级联', () => {
    const assistantRepo = createAssistantRepository(db);
    const assistant = makeAssistant(db);
    const convos = createConversationRepository(db);
    const messages = createMessageRepository(db);
    const c1 = convos.create({ assistantId: assistant.id });
    messages.add({ conversationId: c1.id, role: 'user', content: 'x', status: 'completed' });

    assistantRepo.delete(assistant.id); // 内置删不掉，换一个
    const custom = assistantRepo.create({
      name: 'c',
      emoji: null,
      color: null,
      systemPrompt: '',
      temperature: 1,
      topP: 1,
      maxTokens: null,
      modelId: null,
      knowledgeBaseId: null,
      enabledTools: [],
      retrieveAlways: false,
      isBuiltin: false,
      sortOrder: 1,
    });
    const c2 = convos.create({ assistantId: custom.id });
    messages.add({ conversationId: c2.id, role: 'user', content: 'y', status: 'completed' });
    expect(assistantRepo.delete(custom.id)).toBe(true);
    expect(convos.findById(c2.id)).toBeNull();
    expect(
      messages.listByConversation(c2.id),
    ).toHaveLength(0);
  });
});
