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
import { createMemoryService } from '../memory/memory-service';
import { createSettingsService } from '../services/settings-service';
import { createChatOrchestrator } from './chat-orchestrator';
import type { OrchestratorEvent } from './types';

function answerSse(text: string): string {
  const delta = { choices: [{ delta: { content: text } }] };
  const usage = {
    choices: [{ delta: {} }],
    usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 },
  };
  return `data: ${JSON.stringify(delta)}\n\ndata: ${JSON.stringify(usage)}\n\ndata: [DONE]\n\n`;
}

function extractSse(items: unknown): string {
  return (
    `data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify(items) } }] })}\n\n` +
    'data: [DONE]\n\n'
  );
}

async function drain(generator: AsyncGenerator<OrchestratorEvent>) {
  const events: OrchestratorEvent[] = [];
  for await (const event of generator) events.push(event);
  return events;
}

/** 含「中文」→ 向量 A；其余 → 与 A 正交。模拟稳定的语义嵌入 */
function vectorFor(text: string): number[] {
  return text.includes('中文') ? [1, 0, 0] : [0, 1, 0];
}

describe('M3 对话编排 × 长期记忆（端到端）', () => {
  let db: DatabaseInstance;
  let cipher: SecretCipher;
  let tempRoot: string;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-m3-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    cipher = createWebCipher();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const provider = createProviderRepository(db).create({
      name: '测试供应',
      protocol: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      apiKeyCipher: '',
      enabled: true,
      sortOrder: 0,
    });
    const model = createModelRepository(db).create({
      providerId: provider.id,
      modelId: 'local-embed-chat',
      displayName: '聊天嵌入一体模型',
      capabilities: ['chat', 'embedding'],
      contextWindow: 4096,
    });
    createSettingsService({ db, cipher }).update({
      defaultChatModelId: model.id,
      defaultEmbeddingModelId: model.id,
    });

    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      const endpoint = String(url);
      const body = JSON.parse(String(init.body)) as {
        input?: string[];
        messages?: Array<{ role: string; content: string }>;
      };
      if (endpoint.endsWith('/embeddings')) {
        const data = (body.input ?? []).map((text, index) => ({
          index,
          embedding: vectorFor(text),
        }));
        return new Response(JSON.stringify({ data }), {
          headers: { 'content-type': 'application/json' },
        });
      }
      const system = body.messages?.[0]?.content ?? '';
      if (system.includes('长期记忆提取助手')) {
        return new Response(
          extractSse([
            { kind: 'preference', content: '用户偏好中文回复', importance: 0.9 },
          ]),
          { headers: { 'content-type': 'text/event-stream' } },
        );
      }
      return new Response(answerSse('你好！'), {
        headers: { 'content-type': 'text/event-stream' },
      });
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    db.close();
    resetDataRootForTest();
  });

  it('首轮提取记忆入库；次轮召回并下发 memories 事件，system 注入【长期记忆】', async () => {
    const orchestrator = createChatOrchestrator({ db, cipher });
    const assistant = createAssistantsService({ db, cipher }).list()[0]!;
    expect(assistant.memoryEnabled).toBe(true);

    const first = await drain(
      orchestrator.streamChat({ assistantId: assistant.id, content: '以后请用中文回复我' }),
    );
    expect(first.map((e) => e.event)).toEqual(['meta', 'delta', 'done']);
    await orchestrator.waitForBackgroundJobs();

    const memories = createMemoryService({ db, cipher }).list();
    expect(memories).toHaveLength(1);
    expect(memories[0]!).toMatchObject({ kind: 'preference', content: '用户偏好中文回复' });
    expect(memories[0]!.sourceConversationId).toBeTruthy();

    const conversationId = (first[0]!.data as { conversationId: string }).conversationId;
    const second = await drain(
      orchestrator.streamChat({
        assistantId: assistant.id,
        conversationId,
        content: '用中文怎么打招呼',
      }),
    );
    expect(second.map((e) => e.event)).toEqual(['meta', 'memories', 'delta', 'done']);
    await orchestrator.waitForBackgroundJobs();
    const memoryEvent = second[1]!;
    expect(memoryEvent.data).toMatchObject({
      memories: [{ kind: 'preference', content: '用户偏好中文回复' }],
    });

    // 次轮主回答请求的 system 已注入记忆块（提取请求不算主回答）
    const chatBodies = fetchMock.mock.calls
      .map((call) => JSON.parse(String(call[1].body)))
      .filter((b) => Array.isArray(b.messages) && !String(b.messages[0]?.content).includes('记忆提取助手'));
    const turnTwoSystem = chatBodies[1]!.messages[0]!.content as string;
    expect(turnTwoSystem).toContain('【长期记忆】');
    expect(turnTwoSystem).toContain('用户偏好中文回复');
  });

  it('助手关闭记忆：不召回、不提取，也不发起嵌入请求', async () => {
    const service = createAssistantsService({ db, cipher });
    service.update(service.list()[0]!.id, { memoryEnabled: false });
    const assistant = service.list()[0]!;

    const events = await drain(
      createChatOrchestrator({ db, cipher }).streamChat({
        assistantId: assistant.id,
        content: '以后请用中文回复我',
      }),
    );
    expect(events.map((e) => e.event)).toEqual(['meta', 'delta', 'done']);

    const endpoints = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(endpoints.some((u) => u.endsWith('/embeddings'))).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(createMemoryService({ db, cipher }).list()).toHaveLength(0);
  });
});
