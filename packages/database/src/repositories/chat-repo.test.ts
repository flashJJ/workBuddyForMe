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

    // v1.3：流式结束随 complete 持久化引用（历史重渲染也要能显示脚注）
    messages.complete(
      assistantMsg.id,
      '你好，有什么可以帮你？[1]',
      { promptTokens: 10, completionTokens: 8, totalTokens: 18 },
      [
        {
          ordinal: 1,
          documentId: 'doc-1',
          documentName: '手册.txt',
          snippet: '片段',
          sourceUrl: null,
          pageNo: 2,
          paragraphNo: 3,
          charStart: 0,
          charEnd: 10,
          staticKind: 'chunk',
        },
      ],
    );
    const withCitations = messages.findById(assistantMsg.id)!;
    expect(withCitations.citations).toHaveLength(1);
    expect(withCitations.citations[0]).toMatchObject({
      ordinal: 1,
      documentName: '手册.txt',
      pageNo: 2,
      paragraphNo: 3,
      staticKind: 'chunk',
    });

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

  it('v0.5 lastNAfter：跳过最旧 N 条后取最近消息（跳过的是旧消息而非新消息）', () => {
    const assistant = makeAssistant(db);
    const convos = createConversationRepository(db);
    const messages = createMessageRepository(db);
    const c1 = convos.create({ assistantId: assistant.id });
    for (let i = 1; i <= 6; i += 1) {
      messages.add({
        conversationId: c1.id,
        role: i % 2 === 1 ? 'user' : 'assistant',
        content: `m${i}`,
        status: 'completed',
      });
    }

    // skip=0 等价 lastN（全部正序返回）
    expect(messages.lastNAfter(c1.id, 0, 10).map((m) => m.content)).toEqual([
      'm1', 'm2', 'm3', 'm4', 'm5', 'm6',
    ]);
    // 折叠 2 条后：保留 m3..m6，仍正序
    expect(messages.lastNAfter(c1.id, 2, 10).map((m) => m.content)).toEqual([
      'm3', 'm4', 'm5', 'm6',
    ]);
    // 折叠 2 条 + 预算只装 2 条：取最新 m5、m6
    expect(messages.lastNAfter(c1.id, 2, 2).map((m) => m.content)).toEqual(['m5', 'm6']);
    // skip >= 总条数：空（不能绕回取到最新消息）
    expect(messages.lastNAfter(c1.id, 6, 10)).toEqual([]);
    expect(messages.lastNAfter(c1.id, 99, 10)).toEqual([]);
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
