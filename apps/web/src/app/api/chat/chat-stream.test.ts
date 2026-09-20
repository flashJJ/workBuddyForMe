import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDatabase,
  createModelRepository,
  createProviderRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createSettingsService, createWebCipher } from '@wbfm/core';
import { __buildContainerForTest, __setContainerForTest } from '@/lib/server/container';
import { parseSseChunks } from '@/lib/server/sse-stream';
import { POST as streamChat } from './stream/route';
import {
  GET as listConversations,
  POST as createConversation,
} from '../conversations/route';
import { GET as getMessages } from '../conversations/[id]/messages/route';
import { PATCH as renameConversation, DELETE as deleteConversation } from '../conversations/[id]/route';

const encoder = new TextEncoder();
const SSE_BODY =
  'data: {"choices":[{"delta":{"content":"你好"}}]}\n\n' +
  'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":4,"completion_tokens":2,"total_tokens":6}}\n\n' +
  'data: [DONE]\n\n';

const jsonRequest = (body: unknown, method = 'POST', init: RequestInit = {}) =>
  new Request('http://127.0.0.1/x', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    ...init,
  });

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

describe('会话 CRUD 与 SSE 对话（TR-21.1）', () => {
  let db: DatabaseInstance;
  let builtinAssistantId: string;
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-web-t21-'));
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

  function seedChatModel() {
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
  }

  it('会话创建/重命名/列表/删除 404', async () => {
    const created = await createConversation(
      jsonRequest({ assistantId: builtinAssistantId, title: '测试会话' }),
    );
    expect(created.status).toBe(201);
    const conversation = (await created.json()).data;

    const renamed = await renameConversation(
      jsonRequest({ title: '新标题' }, 'PATCH'),
      { params: Promise.resolve({ id: conversation.id }) },
    );
    expect((await renamed.json()).data.title).toBe('新标题');
    expect((await (await listConversations(new Request('http://x'))).json()).data).toHaveLength(1);

    const deleted = await deleteConversation(new Request('http://x', { method: 'DELETE' }), {
      params: Promise.resolve({ id: conversation.id }),
    });
    expect(deleted.status).toBe(200);
  });

  it('SSE：逐块读取 meta→delta→done 并拼接，历史消息落库可查', async () => {
    seedChatModel();
    vi.mocked(fetch).mockResolvedValue(
      new Response(SSE_BODY, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    );

    const response = await streamChat(
      jsonRequest({ assistantId: builtinAssistantId, content: '你好' }),
    );
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const events = parseSseChunks(await readAll(response));
    expect(events.map((e) => e.event)).toEqual(['meta', 'delta', 'done']);
    expect((events[1]!.data as { content: string }).content).toBe('你好');
    const conversationId = (events[0]!.data as { conversationId: string }).conversationId;
    expect((events[2]!.data as { content: string }).content).toBe('你好');

    const messagesResponse = await getMessages(new Request('http://x'), {
      params: Promise.resolve({ id: conversationId }),
    });
    const messages = (await messagesResponse.json()).data;
    expect(messages).toHaveLength(2);
    expect(messages[1]!.status).toBe('completed');
    expect(messages[1]!.totalTokens).toBe(6);
  });

  it('未配置模型：SSE error 事件结构正确，助手消息标 error', async () => {
    const response = await streamChat(
      jsonRequest({ assistantId: builtinAssistantId, content: 'hi' }),
    );
    const events = parseSseChunks(await readAll(response));
    expect(events[0]!.event).toBe('meta');
    expect(events[1]!.event).toBe('error');
    expect(events[1]!.data).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('客户端断开：abort 传导到上游，消息置 stopped', async () => {
    seedChatModel();
    const upstreamSignal = vi.fn();
    vi.mocked(fetch).mockImplementation(
      (_input: RequestInfo | URL, init?: RequestInit) => {
        init?.signal?.addEventListener('abort', () => upstreamSignal());
        return Promise.resolve(
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(encoder.encode(SSE_BODY.split('\n\n')[0] + '\n\n'));
                init!.signal!.addEventListener('abort', () => {
                  controller.error(new DOMException('Aborted', 'AbortError'));
                });
              },
            }),
            { status: 200, headers: { 'content-type': 'text/event-stream' } },
          ),
        );
      },
    );

    const abortController = new AbortController();
    const response = await streamChat(
      jsonRequest({ assistantId: builtinAssistantId, content: '继续' }, 'POST', {
        signal: abortController.signal,
      }),
    );

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    await reader.read(); // meta
    await reader.read(); // delta
    abortController.abort();
    let raw = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      raw += decoder.decode(value, { stream: true });
    }
    const events = parseSseChunks(raw);
    expect(events.at(-1)!.event).toBe('done');
    expect(upstreamSignal).toHaveBeenCalled();
  });
});
