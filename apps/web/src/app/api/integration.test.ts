import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAssistantRepository,
  createDatabase,
  createMessageRepository,
  createModelRepository,
  createProviderRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createSettingsService, createWebCipher } from '@wbfm/core';
import { ApiError, ERROR_CODES, type ErrorCode } from '@wbfm/shared';
import { ProviderError } from '@wbfm/ai';
import { __buildContainerForTest, __setContainerForTest } from '@/lib/server/container';
import { toErrorResponse } from '@/lib/server/api-response';
import { parseSseChunks } from '@/lib/server/sse-stream';
import { GET as systemInfo } from './system/info/route';
import { DELETE as deleteModel } from './models/[id]/route';
import { DELETE as deleteProvider } from './providers/[id]/route';
import { POST as createConversation } from './conversations/route';
import { PATCH as patchConversation, DELETE as deleteConversation } from './conversations/[id]/route';
import { GET as getMessages } from './conversations/[id]/messages/route';
import { POST as streamChat } from './chat/stream/route';

const jsonRequest = (body: unknown, method = 'POST') =>
  new Request('http://127.0.0.1/x', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const paramCtx = (id: string) => ({ params: Promise.resolve({ id }) });

const SSE_BODY =
  'data: {"choices":[{"delta":{"content":"回答"}}]}\n\n' +
  'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}\n\n' +
  'data: [DONE]\n\n';

async function readAll(response: Response): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let raw = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    raw += decoder.decode(value, { stream: true });
  }
  return raw + decoder.decode();
}

function seedChatModel(db: DatabaseInstance): string {
  const provider = createProviderRepository(db).create({
    name: 'p',
    protocol: 'openai-compatible',
    baseUrl: 'https://api.example.com/v1',
    apiKeyCipher: '',
    enabled: true,
    sortOrder: 0,
  });
  const model = createModelRepository(db).create({
    providerId: provider.id,
    modelId: 'gpt-test',
    capabilities: ['chat'],
    contextWindow: null,
  });
  createSettingsService({ db, cipher: createWebCipher() }).update({
    defaultChatModelId: model.id,
  });
  return provider.id;
}

describe('API 集成测试全集（TR-33.1）', () => {
  let db: DatabaseInstance;
  let builtinAssistantId: string;

  beforeEach(() => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-web-t33-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    const services = __buildContainerForTest(db, createWebCipher());
    builtinAssistantId = services.assistants.list()[0]!.id;
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
  });

  it('system/info：返回数据根与版本号', async () => {
    const response = await systemInfo(new Request('http://x/api/system/info'));
    expect(response.status).toBe(200);
    const payload = (await response.json()).data;
    expect(payload.dataDir).toContain('wbfm-web-t33-');
    expect(payload.version).toBeTruthy();
  });

  it('模型删除：成功后列表清空，重复删除 404', async () => {
    const providerId = seedChatModel(db);
    const models = createModelRepository(db).listByProvider(providerId);
    expect(models.length).toBeGreaterThan(0);
    const model = models[0]!;

    const removed = await deleteModel(new Request('http://x', { method: 'DELETE' }), paramCtx(model.id));
    expect(removed.status).toBe(200);
    expect(createModelRepository(db).listByProvider(model.providerId)).toHaveLength(0);

    const missing = await deleteModel(new Request('http://x', { method: 'DELETE' }), paramCtx(model.id));
    expect(missing.status).toBe(404);
    expect((await missing.json()).error.code).toBe('NOT_FOUND');
  });

  it('供应商删除级联：名下模型全部移除', async () => {
    const providerId = seedChatModel(db);
    createModelRepository(db).create({
      providerId,
      modelId: 'embed-x',
      capabilities: ['embedding'],
      contextWindow: null,
    });
    expect(createModelRepository(db).listByProvider(providerId)).toHaveLength(2);

    const removed = await deleteProvider(new Request('http://x', { method: 'DELETE' }), paramCtx(providerId));
    expect(removed.status).toBe(200);
    expect(createModelRepository(db).listByProvider(providerId)).toHaveLength(0);
  });

  it('会话删除级联消息；更新/查询不存在的会话 404', async () => {
    const created = await createConversation(
      jsonRequest({ assistantId: builtinAssistantId, title: '级联验证' }),
    );
    const conversationId = (await created.json()).data.id;

    seedChatModel(db);
    vi.mocked(fetch).mockResolvedValue(
      new Response(SSE_BODY, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    );
    await streamChat(
      jsonRequest({ assistantId: builtinAssistantId, content: '你好', conversationId }),
    );
    expect(createMessageRepository(db).listByConversation(conversationId)).toHaveLength(2);

    const missingPatch = await patchConversation(jsonRequest({ title: 'x' }, 'PATCH'), {
      params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }),
    });
    expect(missingPatch.status).toBe(404);

    const missingMessages = await getMessages(new Request('http://x'), {
      params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }),
    });
    expect(missingMessages.status).toBe(404);

    const removed = await deleteConversation(new Request('http://x', { method: 'DELETE' }), {
      params: Promise.resolve({ id: conversationId }),
    });
    expect(removed.status).toBe(200);
    expect(createMessageRepository(db).listByConversation(conversationId)).toHaveLength(0);
  });

  it('SSE 流式失败分支：上游 504 归一化 PROVIDER_ERROR，消息标 error', async () => {
    seedChatModel(db);
    vi.mocked(fetch).mockResolvedValue(new Response('upstream down', { status: 504 }));

    const response = await streamChat(
      jsonRequest({ assistantId: builtinAssistantId, content: 'hi' }),
    );
    const events = parseSseChunks(await readAll(response));
    expect(events[0]!.event).toBe('meta');
    const failure = events.at(-1)!;
    expect(failure.event).toBe('error');
    expect(failure.data).toMatchObject({ code: 'PROVIDER_ERROR' });

    const conversationId = (events[0]!.data as { conversationId: string }).conversationId;
    const [userMessage, assistantMessage] = createMessageRepository(db).listByConversation(
      conversationId,
    );
    expect(userMessage!.role).toBe('user');
    expect(assistantMessage!.status).toBe('error');
    expect(assistantMessage!.errorCode).toBe('PROVIDER_ERROR');
  });

  it('错误码一致性：领域错误码 → HTTP 状态映射全量断言', async () => {
    const expectations: Array<[ErrorCode, number]> = [
      ['VALIDATION_ERROR', 422],
      ['UNAUTHORIZED', 401],
      ['FORBIDDEN', 403],
      ['NOT_FOUND', 404],
      ['CONFLICT', 409],
      ['PROVIDER_ERROR', 502],
      ['PROVIDER_TIMEOUT', 504],
      ['INTERNAL_ERROR', 500],
    ];
    expect(Object.keys(ERROR_CODES)).toHaveLength(expectations.length + 2); // 另含 422/501 两个补充码

    for (const [code, status] of expectations) {
      const response = toErrorResponse(new ApiError(code, `示例错误：${code}`));
      expect(response.status).toBe(status);
      const payload = await response.json();
      expect(payload.success).toBe(false);
      expect(payload.error.code).toBe(code);
    }
  });

  it('供应商超时错误（PROVIDER_TIMEOUT）映射 504 并保留 retriable 标记', async () => {
    const response = toErrorResponse(
      new ProviderError({ code: 'PROVIDER_TIMEOUT', message: '上游超时', retriable: true }),
    );
    expect(response.status).toBe(504);
    expect((await response.json()).error.code).toBe('PROVIDER_TIMEOUT');
  });

  it('工具调用 SSE：tool start/end 事件下发，tool_trace 随消息落库', async () => {
    seedChatModel(db);
    createAssistantRepository(db).update(builtinAssistantId, {
      enabledTools: ['current_time'],
    });

    const toolHead = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              { index: 0, id: 'call-t1', type: 'function', function: { name: 'current_time', arguments: '' } },
            ],
          },
        },
      ],
    });
    const toolTail = JSON.stringify({
      choices: [
        {
          delta: { tool_calls: [{ index: 0, function: { arguments: '{}' } }] },
          finish_reason: 'tool_calls',
        },
      ],
    });
    const toolSse = `data: ${toolHead}\n\ndata: ${toolTail}\n\ndata: [DONE]\n\n`;
    vi.mocked(fetch)
      .mockImplementationOnce(
        async () => new Response(toolSse, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
      )
      .mockImplementationOnce(
        async () => new Response(SSE_BODY, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
      );

    const response = await streamChat(
      jsonRequest({ assistantId: builtinAssistantId, content: '现在几点了' }),
    );
    const events = parseSseChunks(await readAll(response));
    expect(events.map((e) => e.event)).toEqual(['meta', 'tool', 'tool', 'delta', 'done']);
    expect(events[1]).toMatchObject({
      event: 'tool',
      data: { phase: 'start', callId: 'call-t1', tool: 'current_time' },
    });
    expect(events[2]!.data).toMatchObject({ phase: 'end', status: 'ok' });

    const conversationId = (events[0]!.data as { conversationId: string }).conversationId;
    const [, assistantMessage] = createMessageRepository(db).listByConversation(conversationId);
    expect(assistantMessage!.toolTrace).toHaveLength(1);
    expect(assistantMessage!.toolTrace[0]).toMatchObject({
      callId: 'call-t1',
      tool: 'current_time',
      status: 'ok',
    });
  });

  it('regenerate：删除尾部助手消息后重新作答，不新增用户消息', async () => {
    seedChatModel(db);
    const created = await createConversation(
      jsonRequest({ assistantId: builtinAssistantId }),
    );
    const conversationId = (await created.json()).data.id;

    vi.mocked(fetch).mockResolvedValue(
      new Response(SSE_BODY, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    );
    const first = await streamChat(
      jsonRequest({ assistantId: builtinAssistantId, content: '讲个笑话', conversationId }),
    );
    await readAll(first);
    expect(createMessageRepository(db).listByConversation(conversationId)).toHaveLength(2);

    const second = await streamChat(
      jsonRequest({ assistantId: builtinAssistantId, content: '讲个笑话', conversationId, regenerate: true }),
    );
    const events = parseSseChunks(await readAll(second));
    expect(events.at(-1)!.event).toBe('done');

    const messages = createMessageRepository(db).listByConversation(conversationId);
    expect(messages).toHaveLength(2);
    expect(messages[0]!.role).toBe('user');
    expect(messages[1]!.role).toBe('assistant');
  });
});
