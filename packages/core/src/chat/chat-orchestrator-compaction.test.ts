import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createConversationRepository,
  createDatabase,
  createMessageRepository,
  createModelRepository,
  createProviderRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher, type SecretCipher } from '../secrets/cipher';
import { createAssistantsService } from '../services/assistant-service';
import { createSettingsService } from '../services/settings-service';
import { createChatOrchestrator } from './chat-orchestrator';
import type { OrchestratorEvent } from './types';

const encoder = new TextEncoder();

function sse(delta: string): string {
  return (
    `data: {"choices":[{"delta":{"content":"${delta}"}}]}\n\n` +
    'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n' +
    'data: [DONE]\n\n'
  );
}

async function drain(generator: AsyncGenerator<OrchestratorEvent>) {
  const events: OrchestratorEvent[] = [];
  for await (const event of generator) events.push(event);
  return events;
}

/** 小上下文窗口 + 6 轮长历史：回合后必然越过 0.7 触发线 */
function seedLongConversation(
  db: DatabaseInstance,
  cipher: SecretCipher,
): { conversationId: string; assistantId: string } {
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
    displayName: '小窗口模型',
    capabilities: ['chat'],
    contextWindow: 3000,
  });
  createSettingsService({ db, cipher }).update({ defaultChatModelId: model.id });
  const assistant = createAssistantsService({ db, cipher }).list()[0]!;
  const convRepo = createConversationRepository(db);
  const msgRepo = createMessageRepository(db);
  const conv = convRepo.create({ assistantId: assistant.id });
  for (let i = 0; i < 6; i += 1) {
    msgRepo.add({
      conversationId: conv.id,
      role: 'user',
      content: `第${i}轮用户：` + '甲'.repeat(200),
      status: 'completed',
    });
    msgRepo.add({
      conversationId: conv.id,
      role: 'assistant',
      content: `第${i}轮助手：` + '乙'.repeat(200),
      status: 'completed',
    });
  }
  convRepo.touch(conv.id);
  return { conversationId: conv.id, assistantId: assistant.id };
}

describe('对话压缩（M2：递归摘要）', () => {
  let db: DatabaseInstance;
  let cipher: SecretCipher;
  let tempRoot: string;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-m2-'));
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

  it('回合成功后触发压缩：第二次请求是 temp=0 摘要调用，摘要与折叠条数写回会话', async () => {
    const { conversationId, assistantId } = seedLongConversation(db, cipher);
    fetchMock
      .mockResolvedValueOnce(
        new Response(sse('本轮回答'), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(sse('早期摘要内容'), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }),
      );

    const events = await drain(
      createChatOrchestrator({ db, cipher }).streamChat({
        assistantId,
        conversationId,
        content: '最新问题',
      }),
    );
    expect(events.at(-1)).toMatchObject({ event: 'done' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const summaryBody = JSON.parse(
      (fetchMock.mock.calls[1]![1] as RequestInit).body as string,
    ) as {
      temperature?: number;
      messages: { role: string; content: unknown }[];
    };
    expect(summaryBody.temperature).toBe(0);
    expect(String(summaryBody.messages[0]!.content)).toContain('对话摘要助手');
    expect(String(summaryBody.messages[1]!.content)).toContain('需要合并的早期对话');

    const conv = createConversationRepository(db).findById(conversationId)!;
    expect(conv.summary).toBe('早期摘要内容');
    expect(conv.summaryTurns).toBeGreaterThanOrEqual(1);
  });

  it('摘要持久化后下一轮：system 注入摘要块，历史跳过已折叠条数', async () => {
    const { conversationId, assistantId } = seedLongConversation(db, cipher);
    fetchMock
      .mockResolvedValueOnce(
        new Response(sse('本轮回答'), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(sse('早期摘要内容'), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(sse('次轮回答'), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(sse('更新后的摘要'), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }),
      );

    const orchestrator = createChatOrchestrator({ db, cipher });
    await drain(
      orchestrator.streamChat({ assistantId, conversationId, content: '第一个新问题' }),
    );
    const convAfter = createConversationRepository(db).findById(conversationId)!;
    expect(convAfter.summaryTurns).toBeGreaterThanOrEqual(1);

    await drain(
      orchestrator.streamChat({ assistantId, conversationId, content: '第二个新问题' }),
    );
    // 第三轮请求可能再次触发压缩（第 4 次请求），断言对话请求体取最后一次 chat 之前的那次
    const chatBodies = fetchMock.mock.calls
      .map((call) => JSON.parse((call[1] as RequestInit).body as string))
      // 摘要请求 temperature=0 且 system 是摘要指令；对话请求 system 含人设
      .filter((body) => !String(body.messages[0]!.content).includes('对话摘要助手'));
    const nextTurn = chatBodies.at(-1)! as {
      messages: { role: string; content: unknown }[];
    };
    expect(String(nextTurn.messages[0]!.content)).toContain('【对话摘要】');
    expect(String(nextTurn.messages[0]!.content)).toContain('早期摘要内容');

    // 14 = 12 条预置 + 第一轮 user/assistant；压缩后下轮出站 = skip 后的未折叠消息 + 本轮 user
    const expectedNonSystem = 14 - convAfter.summaryTurns + 1;
    expect(nextTurn.messages).toHaveLength(1 + expectedNonSystem);
  });

  it('摘要请求失败时静默降级：done 正常产出，不写摘要，下轮仍可对话', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { conversationId, assistantId } = seedLongConversation(db, cipher);
    fetchMock
      .mockResolvedValueOnce(
        new Response(sse('本轮回答'), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }),
      )
      .mockResolvedValueOnce(new Response('boom', { status: 500 }));

    const events = await drain(
      createChatOrchestrator({ db, cipher }).streamChat({
        assistantId,
        conversationId,
        content: '问题',
      }),
    );
    expect(events.at(-1)).toMatchObject({
      event: 'done',
      data: { content: '本轮回答' },
    });
    const conv = createConversationRepository(db).findById(conversationId)!;
    expect(conv.summary).toBeNull();
    expect(conv.summaryTurns).toBe(0);
  });

  it('abort/stopped 路径不触发压缩：只有一次对话请求', async () => {
    const { conversationId, assistantId } = seedLongConversation(db, cipher);
    const controller = new AbortController();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(stream) {
              stream.enqueue(encoder.encode(sse('片段').split('\n\n')[0] + '\n\n'));
              init.signal!.addEventListener('abort', () => {
                stream.error(new DOMException('Aborted', 'AbortError'));
              });
            },
          }),
          { status: 200, headers: { 'content-type': 'text/event-stream' } },
        ),
    );

    const generator = createChatOrchestrator({ db, cipher }).streamChat({
      assistantId,
      conversationId,
      content: '中断问题',
      signal: controller.signal,
    });
    await generator.next(); // meta
    await generator.next(); // delta
    controller.abort();
    await generator.next(); // done(stopped)

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const conv = createConversationRepository(db).findById(conversationId)!;
    expect(conv.summary).toBeNull();
    expect(conv.summaryTurns).toBe(0);
  });
});
