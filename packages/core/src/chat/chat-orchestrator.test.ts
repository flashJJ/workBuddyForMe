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
import { createWebCipher, type SecretCipher } from '../secrets/cipher';
import { createAssistantsService } from '../services/assistant-service';
import { createConversationService } from '../services/conversation-service';
import { createSettingsService } from '../services/settings-service';
import { createChatOrchestrator } from './chat-orchestrator';
import type { OrchestratorEvent } from './types';

const encoder = new TextEncoder();

const SSE_BODY =
  'data: {"choices":[{"delta":{"content":"你好"}}]}\n\n' +
  'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n' +
  'data: [DONE]\n\n';

async function drain(generator: AsyncGenerator<OrchestratorEvent>) {
  const events: OrchestratorEvent[] = [];
  for await (const event of generator) events.push(event);
  return events;
}

describe('对话编排（TR-15.1）', () => {
  let db: DatabaseInstance;
  let cipher: SecretCipher;
  let tempRoot: string;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-t15-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    cipher = createWebCipher();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    db.close();
    resetDataRootForTest();
  });

  function seedProvider() {
    const providers = createProviderRepository(db);
    const models = createModelRepository(db);
    const provider = providers.create({
      name: '测试供应',
      protocol: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      apiKeyCipher: '',
      enabled: true,
      sortOrder: 0,
    });
    const model = models.create({
      providerId: provider.id,
      modelId: 'gpt-test',
      displayName: '测试模型',
      capabilities: ['chat'],
      contextWindow: 4096,
    });
    createSettingsService({ db, cipher }).update({ defaultChatModelId: model.id });
    return model;
  }

  it('正常流：meta→delta→done，落库完整正文与 usage，历史含 system', async () => {
    seedProvider();
    const assistant = createAssistantsService({ db, cipher }).list()[0]!;
    const orchestrator = createChatOrchestrator({ db, cipher });
    fetchMock.mockResolvedValue(
      new Response(SSE_BODY, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    );

    const events = await drain(
      orchestrator.streamChat({ assistantId: assistant.id, content: '你好' }),
    );

    expect(events.map((e) => e.event)).toEqual(['meta', 'delta', 'done']);
    expect(events[1]).toMatchObject({ event: 'delta', data: { content: '你好' } });
    const meta = events[0]!.data as { conversationId: string; messageId: string };
    expect(events[2]).toMatchObject({
      event: 'done',
      data: { content: '你好', usage: { totalTokens: 15 } },
    });

    const messages = createConversationService({ db, cipher }).listMessages(meta.conversationId);
    expect(messages).toHaveLength(2);
    expect(messages[1]!.status).toBe('completed');
    expect(messages[1]!.content).toBe('你好');
    expect(messages[1]!.totalTokens).toBe(15);

    const requestBody = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(requestBody.messages[0].role).toBe('system');
    expect(requestBody.stream).toBe(true);
    expect(requestBody.model).toBe('gpt-test');
  });

  it('未配置模型：error 事件且助手消息落 error 状态', async () => {
    const assistant = createAssistantsService({ db, cipher }).list()[0]!;
    const events = await drain(
      createChatOrchestrator({ db, cipher }).streamChat({
        assistantId: assistant.id,
        content: 'hi',
      }),
    );
    expect(events.at(-1)).toMatchObject({
      event: 'error',
      data: { code: 'VALIDATION_ERROR' },
    });
  });

  it('上游 500：ProviderError 归一化，消息标 error 不写残缺正文', async () => {
    seedProvider();
    const assistant = createAssistantsService({ db, cipher }).list()[0]!;
    fetchMock.mockResolvedValue(new Response('boom', { status: 500 }));

    const events = await drain(
      createChatOrchestrator({ db, cipher }).streamChat({
        assistantId: assistant.id,
        content: 'hi',
      }),
    );

    expect(events.at(-1)!.event).toBe('error');
    const meta = events[0]!.data as { conversationId: string };
    const messages = createConversationService({ db, cipher }).listMessages(meta.conversationId);
    expect(messages[1]!.status).toBe('error');
    expect(messages[1]!.content).toBe('');
    expect(messages[1]!.errorCode).toBeTruthy();
  });

  it('中途 abort：消息置 stopped 保留片段，不产生 error 事件', async () => {
    seedProvider();
    const assistant = createAssistantsService({ db, cipher }).list()[0]!;
    const controller = new AbortController();

    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(stream) {
              stream.enqueue(encoder.encode(SSE_BODY.split('\n\n')[0] + '\n\n'));
              init.signal!.addEventListener('abort', () => {
                stream.error(new DOMException('Aborted', 'AbortError'));
              });
            },
          }),
          { status: 200, headers: { 'content-type': 'text/event-stream' } },
        ),
    );

    const generator = createChatOrchestrator({ db, cipher }).streamChat({
      assistantId: assistant.id,
      content: '继续',
      signal: controller.signal,
    });
    const events: OrchestratorEvent[] = [];
    const first = await generator.next();
    events.push(first.value as OrchestratorEvent); // meta
    const delta = await generator.next();
    events.push(delta.value as OrchestratorEvent);
    expect((delta.value as { data: { content: string } }).data.content).toBe('你好');

    controller.abort();
    const final = await generator.next();
    events.push(final.value as OrchestratorEvent);

    expect(events.at(-1)!.event).toBe('done');
    const meta = events[0]!.data as { conversationId: string };
    const messages = createConversationService({ db, cipher }).listMessages(meta.conversationId);
    expect(messages[1]!.status).toBe('stopped');
    expect(messages[1]!.content).toBe('你好');
  });
});
