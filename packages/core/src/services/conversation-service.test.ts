import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '@wbfm/shared';
import {
  createConversationRepository,
  createDatabase,
  createMessageRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher, type SecretCipher } from '../secrets/cipher';
import { createConversationService, deriveTitle } from './conversation-service';
import { createAssistantsService } from './assistant-service';

describe('会话与消息服务（TR-14.1）', () => {
  let db: DatabaseInstance;
  let cipher: SecretCipher;
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-t14-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    cipher = createWebCipher();
  });

  afterEach(() => {
    db.close();
    resetDataRootForTest();
  });

  it('deriveTitle：取首行、去空白、超长截断加省略号', () => {
    expect(deriveTitle('  你好世界  ')).toBe('你好世界');
    expect(deriveTitle('第一行\n第二行')).toBe('第一行');
    const long = '一'.repeat(40);
    expect(deriveTitle(long)).toBe(`${'一'.repeat(30)}…`);
  });

  it('创建/重命名/不存在 404/助手校验', () => {
    const assistants = createAssistantsService({ db, cipher });
    const service = createConversationService({ db, cipher });
    const assistant = assistants.list()[0]!;

    const conversation = service.create(assistant.id);
    expect(conversation.title).toBe('新会话');
    expect(service.rename(conversation.id, '标题')!.title).toBe('标题');
    expect(service.get(conversation.id).title).toBe('标题');
    expect(() => service.get('nope')).toThrow(ApiError);
    expect(() => service.create('no-assistant')).toThrow(/助手不存在/);
  });

  it('追加消息：自动标题、时间排序、历史窗口', () => {
    const assistant = createAssistantsService({ db, cipher }).list()[0]!;
    const service = createConversationService({ db, cipher });
    const conversation = service.create(assistant.id);

    service.appendMessage({ conversationId: conversation.id, role: 'user', content: '帮我写个周报\n细节' });
    expect(service.get(conversation.id).title).toBe('帮我写个周报');

    service.appendMessage({
      conversationId: conversation.id,
      role: 'assistant',
      content: '好的',
      status: 'streaming',
    });
    const messages = service.listMessages(conversation.id);
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(service.recentMessages(conversation.id, 10)).toHaveLength(2);
    expect(service.get(conversation.id).lastMessageAt).toBeTruthy();
  });

  it('会话列表按最近消息排序；删除会话级联消息', () => {
    const assistant = createAssistantsService({ db, cipher }).list()[0]!;
    const service = createConversationService({ db, cipher });
    const convos = createConversationRepository(db);
    service.create(assistant.id, '旧');
    const c2 = service.create(assistant.id, '新');
    service.appendMessage({ conversationId: c2.id, role: 'user', content: '新消息' });

    expect(service.list()[0]!.id).toBe(c2.id);

    service.delete(c2.id);
    expect(() => service.get(c2.id)).toThrow(/不存在/);
    const remaining = createMessageRepository(db).listByConversation(c2.id);
    expect(remaining).toEqual([]);
    expect(convos.findById(c2.id)).toBeNull();
  });
});
