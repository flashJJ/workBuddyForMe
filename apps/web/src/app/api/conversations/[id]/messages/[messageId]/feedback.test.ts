import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '@wbfm/core';
import { BUILTIN_ASSISTANT } from '@wbfm/core';
import { __buildContainerForTest, __setContainerForTest } from '@/lib/server/container';
import { PATCH } from './route';

const jsonRequest = (body: unknown) =>
  new Request('http://127.0.0.1/x', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const params = (conversationId: string, messageId: string) => ({
  params: Promise.resolve({ id: conversationId, messageId }),
});

describe('消息反馈路由（P1-2）', () => {
  let db: DatabaseInstance;
  let conversationId: string;
  let assistantMessageId: string;
  let userMessageId: string;

  beforeEach(() => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-web-fb-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    const services = __buildContainerForTest(db, createWebCipher());
    const conversation = services.conversations.create(BUILTIN_ASSISTANT.id, '测试会话');
    conversationId = conversation.id;
    userMessageId = services.conversations
      .appendMessage({ conversationId, role: 'user', content: '你好' })
      .id;
    assistantMessageId = services.conversations
      .appendMessage({ conversationId, role: 'assistant', content: '你好，有什么可以帮你？' })
      .id;
  });

  afterEach(() => {
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
  });

  it('up/down 落库 200；同值再发 null 取消；查询历史带回反馈', async () => {
    const up = await PATCH(
      jsonRequest({ feedback: 'up' }),
      params(conversationId, assistantMessageId),
    );
    expect(up.status).toBe(200);
    expect((await up.json()).data.feedback).toBe('up');

    const cancelResponse = await PATCH(
      jsonRequest({ feedback: null }),
      params(conversationId, assistantMessageId),
    );
    const canceled = (await cancelResponse.json()).data;
    expect(canceled.feedback).toBeNull();
    expect(canceled.feedbackAt).toBeNull();
  });

  it('非法反馈值 422；对用户消息反馈 422；不存在消息 404', async () => {
    const bad = await PATCH(
      jsonRequest({ feedback: 'maybe' }),
      params(conversationId, assistantMessageId),
    );
    expect(bad.status).toBe(422);

    const onUser = await PATCH(
      jsonRequest({ feedback: 'up' }),
      params(conversationId, userMessageId),
    );
    expect(onUser.status).toBe(422);

    const missing = await PATCH(
      jsonRequest({ feedback: 'down' }),
      params(conversationId, 'no-such-message'),
    );
    expect(missing.status).toBe(404);
  });
});
