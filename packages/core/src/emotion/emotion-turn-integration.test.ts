import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDatabase,
  createEmotionStateRepository,
  createModelRepository,
  createProviderRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher, type SecretCipher } from '../secrets/cipher';
import { createAssistantsService } from '../services/assistant-service';
import { createConversationService } from '../services/conversation-service';
import { createSettingsService } from '../services/settings-service';
import { createChatOrchestrator } from '../chat/chat-orchestrator';
import type { OrchestratorEvent } from '../chat/types';

function sse(delta: string): string {
  return (
    `data: {"choices":[{"delta":{"content":${JSON.stringify(delta)}}}]}\n\n` +
    'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n' +
    'data: [DONE]\n\n'
  );
}

async function drain(generator: AsyncGenerator<OrchestratorEvent>) {
  const events: OrchestratorEvent[] = [];
  for await (const event of generator) events.push(event);
  return events;
}

describe('v1.6 M2 情绪协议四态（chat orchestrator 集成）', () => {
  let db: DatabaseInstance;
  let cipher: SecretCipher;
  let tempRoot: string;
  let assistantId: string;
  let conversationId: string;
  let fetchMock: ReturnType<typeof vi.fn>;
  let orchestrator: ReturnType<typeof createChatOrchestrator>;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-emotion-m2-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    cipher = createWebCipher();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const provider = createProviderRepository(db).create({
      name: '供应',
      protocol: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      apiKeyCipher: '',
      enabled: true,
      sortOrder: 0,
    });
    const model = createModelRepository(db).create({
      providerId: provider.id,
      modelId: 'm-test',
      displayName: '测试模型',
      capabilities: ['chat'],
      contextWindow: 4096,
    });
    createSettingsService({ db, cipher }).update({ defaultChatModelId: model.id });
    assistantId = createAssistantsService({ db, cipher }).list()[0]!.id;
    conversationId = createConversationService({ db, cipher }).create(assistantId).id;
    orchestrator = createChatOrchestrator({ db, cipher });
  });

  afterEach(async () => {
    await orchestrator.waitForBackgroundJobs();
    vi.unstubAllGlobals();
    db.close();
    resetDataRootForTest();
  });

  it('态 1（强模型合规）：尾块剥离落库、done.emotion 透传、source=model 写入状态', async () => {
    const reply = '没问题，马上好。\n```json\n{"emotion":"joy","intensity":0.8,"soulEvent":"praise"}\n```';
    fetchMock.mockResolvedValue(
      new Response(sse(reply), { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    );

    const events = await drain(
      orchestrator.streamChat({ assistantId, conversationId, content: '你真棒' }),
    );
    const done = events.find((e) => e.event === 'done')!;
    expect(done.data).toMatchObject({
      content: '没问题，马上好。',
      emotion: { emotion: 'joy', intensity: 0.8, soulEvent: 'praise' },
    });

    // 尾块不进历史
    const convs = createConversationService({ db, cipher });
    const messages = convs.listMessages(conversationId);
    expect(messages.at(-1)!.content).toBe('没问题，马上好。');

    // 状态按 praise 增量更新，事件来源 model
    const record = createEmotionStateRepository(db).get(assistantId);
    expect(record?.state.mood.happiness).toBe(18);
    expect(record?.state.relation.intimacy).toBe(22);
    expect(record?.state.recentEvents[0]?.source).toBe('model');
    expect(record?.state.recentEvents[0]?.type).toBe('praise');

    // 请求 system 含情绪协议与状态段
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(String(body.messages[0].content)).toContain('情绪信号协议');
    expect(String(body.messages[0].content)).toContain('当前情绪状态');
  });

  it('态 2（7B 无尾块 + 夸赞）：规则保底 praise，正文原样，source=rule', async () => {
    fetchMock.mockResolvedValue(
      new Response(sse('嘿嘿谢谢。'), { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    );

    const events = await drain(
      orchestrator.streamChat({ assistantId, conversationId, content: '你太厉害了' }),
    );
    const done = events.find((e) => e.event === 'done')!;
    expect(done.data).toMatchObject({
      content: '嘿嘿谢谢。',
      emotion: { emotion: 'neutral', soulEvent: 'praise' },
    });

    const record = createEmotionStateRepository(db).get(assistantId);
    expect(record?.state.recentEvents[0]?.source).toBe('rule');
    expect(record?.state.relation.intimacy).toBe(22);
  });

  it('态 3（脏尾块）：逐叶回落不报错，正文剥离，按 chat 记账', async () => {
    const reply = '回答正文。\n```json\n{"emotion":"unknown","intensity":5}\n```';
    fetchMock.mockResolvedValue(
      new Response(sse(reply), { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    );

    const events = await drain(
      orchestrator.streamChat({ assistantId, conversationId, content: '继续' }),
    );
    const done = events.find((e) => e.event === 'done')!;
    expect(done.data).toMatchObject({
      content: '回答正文。',
      emotion: { emotion: 'neutral', intensity: 0.6, soulEvent: 'chat' },
    });
    const record = createEmotionStateRepository(db).get(assistantId);
    expect(record?.state.recentEvents[0]?.source).toBe('model');
    expect(record?.state.recentEvents[0]?.type).toBe('chat');
  });

  it('态 4（关闭情绪）：不注入协议、done 无 emotion、不写状态、正文原样', async () => {
    createSettingsService({ db, cipher }).update({ emotionEnabled: false });
    const reply = '正文\n```json\n{"emotion":"joy","soulEvent":"praise"}\n```';
    fetchMock.mockResolvedValue(
      new Response(sse(reply), { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    );

    const events = await drain(
      orchestrator.streamChat({ assistantId, conversationId, content: '你真棒' }),
    );
    const done = events.find((e) => e.event === 'done')!;
    expect(done.data.content).toBe(reply);
    expect('emotion' in done.data).toBe(false);

    expect(createEmotionStateRepository(db).get(assistantId)).toBeNull();
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(String(body.messages[0].content)).not.toContain('情绪信号协议');
    expect(String(body.messages[0].content)).not.toContain('当前情绪状态');
  });
});
