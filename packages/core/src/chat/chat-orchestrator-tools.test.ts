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

function toolCallSse(): string {
  const head = {
    choices: [
      {
        delta: {
          tool_calls: [
            { index: 0, id: 'call-1', type: 'function', function: { name: 'current_time', arguments: '' } },
          ],
        },
      },
    ],
  };
  const tail = {
    choices: [
      {
        delta: { tool_calls: [{ index: 0, function: { arguments: '{}' } }] },
        finish_reason: 'tool_calls',
      },
    ],
  };
  return `data: ${JSON.stringify(head)}\n\ndata: ${JSON.stringify(tail)}\n\ndata: [DONE]\n\n`;
}

function answerSse(text: string): string {
  const delta = { choices: [{ delta: { content: text } }] };
  const usage = {
    choices: [{ delta: {} }],
    usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 },
  };
  return `data: ${JSON.stringify(delta)}\n\ndata: ${JSON.stringify(usage)}\n\ndata: [DONE]\n\n`;
}

async function drain(generator: AsyncGenerator<OrchestratorEvent>) {
  const events: OrchestratorEvent[] = [];
  for await (const event of generator) events.push(event);
  return events;
}

describe('对话编排：工具调用循环（TR-15.2）', () => {
  let db: DatabaseInstance;
  let cipher: SecretCipher;
  let tempRoot: string;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-t15tools-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    cipher = createWebCipher();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    db.close();
    resetDataRootForTest();
  });

  it('current_time 工具轮：tool start/end 事件 → 工具结果回灌 → 最终回答落库含 toolTrace', async () => {
    const assistants = createAssistantsService({ db, cipher });
    assistants.update(assistants.list()[0]!.id, { enabledTools: ['current_time'] });
    const assistant = assistants.list()[0]!;
    fetchMock
      .mockImplementationOnce(() => new Response(toolCallSse(), { headers: { 'content-type': 'text/event-stream' } }))
      .mockImplementationOnce(() => new Response(answerSse('现在是上班时间。'), { headers: { 'content-type': 'text/event-stream' } }));

    const events = await drain(
      createChatOrchestrator({ db, cipher }).streamChat({
        assistantId: assistant.id,
        content: '现在几点',
      }),
    );

    expect(events.map((e) => e.event)).toEqual(['meta', 'tool', 'tool', 'delta', 'done']);
    expect(events[1]).toMatchObject({
      event: 'tool',
      data: { phase: 'start', callId: 'call-1', tool: 'current_time' },
    });
    expect(events[2]).toMatchObject({
      event: 'tool',
      data: { phase: 'end', callId: 'call-1', status: 'ok' },
    });

    // 第二次请求携带 assistant 工具调用与 tool 结果消息，且下发 tools 声明
    const secondBody = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string);
    const roles = secondBody.messages.map((m: { role: string }) => m.role);
    expect(roles).toEqual(['system', 'user', 'assistant', 'tool']);
    const toolMessage = secondBody.messages[3]!;
    expect(toolMessage.role).toBe('tool');
    expect(toolMessage.tool_call_id).toBe('call-1');
    expect(String(toolMessage.content)).toContain('当前时间');
    expect(secondBody.tools[0]!.function.name).toBe('current_time');

    const meta = events[0]!.data as { conversationId: string };
    const messages = createConversationService({ db, cipher }).listMessages(meta.conversationId);
    expect(messages).toHaveLength(2);
    expect(messages[1]!.content).toBe('现在是上班时间。');
    expect(messages[1]!.toolTrace).toHaveLength(1);
    expect(messages[1]!.toolTrace[0]).toMatchObject({
      callId: 'call-1',
      tool: 'current_time',
      status: 'ok',
    });
    expect(messages[1]!.toolTrace[0]!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('regenerate：删除尾部助手消息后重答，用户消息不重复入库', async () => {
    const assistant = createAssistantsService({ db, cipher }).list()[0]!;
    fetchMock
      .mockImplementationOnce(() => new Response(answerSse('第一版'), { headers: { 'content-type': 'text/event-stream' } }))
      .mockImplementationOnce(() => new Response(answerSse('第二版'), { headers: { 'content-type': 'text/event-stream' } }));

    const orchestrator = createChatOrchestrator({ db, cipher });
    const first = await drain(
      orchestrator.streamChat({ assistantId: assistant.id, content: '再讲一次' }),
    );
    const conversationId = (first[0]!.data as { conversationId: string }).conversationId;

    const second = await drain(
      orchestrator.streamChat({
        assistantId: assistant.id,
        conversationId,
        content: '再讲一次',
        regenerate: true,
      }),
    );
    expect(second.map((e) => e.event)).toEqual(['meta', 'delta', 'done']);
    expect((second[2]!.data as { content: string }).content).toBe('第二版');

    const messages = createConversationService({ db, cipher }).listMessages(conversationId);
    expect(messages).toHaveLength(2);
    expect(messages[0]!.role).toBe('user');
    expect(messages[0]!.content).toBe('再讲一次');
    expect(messages[1]!.role).toBe('assistant');
    expect(messages[1]!.content).toBe('第二版');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
