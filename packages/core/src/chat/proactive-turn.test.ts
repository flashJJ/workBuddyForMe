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
import {
  PROACTIVE_MESSAGE_PREFIX,
  PROACTIVE_TRIGGER_PROMPT,
} from './proactive-turn';
import type { OrchestratorEvent } from './types';

const encoder = new TextEncoder();

const SSE_BODY =
  'data: {"choices":[{"delta":{"content":"嗨，还记得我们刚才聊的 AI 入门吗？"}}]}\n\n' +
  'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":80,"completion_tokens":12,"total_tokens":92}}\n\n' +
  'data: [DONE]\n\n';

async function drain(generator: AsyncGenerator<OrchestratorEvent>) {
  const events: OrchestratorEvent[] = [];
  for await (const event of generator) events.push(event);
  return events;
}

describe('F8 主动说话 streamProactive（skip-history 轻量轮）', () => {
  let db: DatabaseInstance;
  let cipher: SecretCipher;
  let tempRoot: string;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-proactive-'));
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

  function seed() {
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
    return createAssistantsService({ db, cipher }).list()[0]!;
  }

  it('meta 带 proactive 标记与临时 id；事件序 meta→delta→done', async () => {
    const assistant = seed();
    fetchMock.mockResolvedValue(
      new Response(SSE_BODY, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    );

    const events = await drain(
      createChatOrchestrator({ db, cipher }).streamProactive({ assistantId: assistant.id }),
    );

    expect(events.map((e) => e.event)).toEqual(['meta', 'delta', 'done']);
    const meta = events[0]!.data as { messageId: string; proactive?: boolean };
    expect(meta.proactive).toBe(true);
    expect(meta.messageId.startsWith(PROACTIVE_MESSAGE_PREFIX)).toBe(true);
    expect(events[2]).toMatchObject({
      event: 'done',
      data: { content: '嗨，还记得我们刚才聊的 AI 入门吗？', usage: { totalTokens: 92 } },
    });
  });

  it('skip-history：不创建会话、不写任何消息，请求含主动指令且无工具声明', async () => {
    const assistant = seed();
    fetchMock.mockResolvedValue(
      new Response(SSE_BODY, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    );

    await drain(
      createChatOrchestrator({ db, cipher }).streamProactive({ assistantId: assistant.id }),
    );

    // 没有任何会话/消息落库
    const conversations = createConversationService({ db, cipher });
    expect(conversations.list(assistant.id)).toHaveLength(0);

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.stream).toBe(true);
    expect(body.tools).toBeUndefined();
    const roles = body.messages.map((m: { role: string }) => m.role);
    expect(roles[0]).toBe('system');
    expect(roles.at(-1)).toBe('user');
    expect(body.messages.at(-1).content).toBe(PROACTIVE_TRIGGER_PROMPT);
  });

  it('带 conversationId：只读最近历史承接话题，仍不落库', async () => {
    const assistant = seed();
    const conversations = createConversationService({ db, cipher });
    const conv = conversations.create(assistant.id, '预热会话');
    conversations.appendMessage({ conversationId: conv.id, role: 'user', content: '我想学 Python', status: 'completed' });
    conversations.appendMessage({ conversationId: conv.id, role: 'assistant', content: '好的，建议从基础语法开始。', status: 'completed' });
    fetchMock.mockResolvedValue(
      new Response(SSE_BODY, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    );

    const events = await drain(
      createChatOrchestrator({ db, cipher }).streamProactive({
        assistantId: assistant.id,
        conversationId: conv.id,
      }),
    );

    const meta = events[0]!.data as { conversationId: string };
    expect(meta.conversationId).toBe(conv.id);
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    // system + 2 条历史 + 触发指令
    expect(body.messages).toHaveLength(4);
    expect(body.messages[1].content).toBe('我想学 Python');
    // 历史仍是原来的 2 条，主动轮未写入
    expect(conversations.listMessages(conv.id)).toHaveLength(2);
  });

  it('未配置模型：error 事件', async () => {
    const assistant = createAssistantsService({ db, cipher }).list()[0]!;
    const events = await drain(
      createChatOrchestrator({ db, cipher }).streamProactive({ assistantId: assistant.id }),
    );
    expect(events.at(-1)).toMatchObject({ event: 'error' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('abort：中止后以 done 收尾且不抛错', async () => {
    const assistant = seed();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(stream) {
              stream.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"嗨"}}]}\n\n'));
              init.signal!.addEventListener('abort', () => {
                stream.error(new DOMException('Aborted', 'AbortError'));
              });
            },
          }),
          { status: 200, headers: { 'content-type': 'text/event-stream' } },
        ),
    );
    const controller = new AbortController();
    const gen = createChatOrchestrator({ db, cipher }).streamProactive({
      assistantId: assistant.id,
      signal: controller.signal,
    });
    const meta = await gen.next();
    expect(meta.value.event).toBe('meta');
    // 消费到首个 delta 后中止
    await gen.next();
    controller.abort();
    const events: OrchestratorEvent[] = [];
    for await (const e of gen) events.push(e);
    expect(events.at(-1)?.event).toBe('done');
  });
});
