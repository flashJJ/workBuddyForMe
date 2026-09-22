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
import { createAttachmentService } from '../services/attachment-service';
import { createConversationService } from '../services/conversation-service';
import { createSettingsService } from '../services/settings-service';
import { createChatOrchestrator } from './chat-orchestrator';
import type { OrchestratorEvent } from './types';

const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const SSE_BODY =
  'data: {"choices":[{"delta":{"content":"看到了"}}]}\n\n' +
  'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n' +
  'data: [DONE]\n\n';

async function drain(generator: AsyncGenerator<OrchestratorEvent>) {
  const events: OrchestratorEvent[] = [];
  for await (const event of generator) events.push(event);
  return events;
}

describe('对话编排 · 视觉（T4）', () => {
  let db: DatabaseInstance;
  let cipher: SecretCipher;
  let tempRoot: string;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-vision-'));
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

  function seedModel(capabilities: Array<'chat' | 'vision'>) {
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
      modelId: capabilities.includes('vision') ? 'qwen-vl-test' : 'gpt-test',
      displayName: capabilities.includes('vision') ? '视觉模型' : '纯文本模型',
      capabilities,
      contextWindow: 4096,
    });
    createSettingsService({ db, cipher }).update({ defaultChatModelId: model.id });
    return model;
  }

  function lastRequestBody(): { messages: Array<Record<string, unknown>> } {
    return JSON.parse((fetchMock.mock.calls.at(-1)![1] as RequestInit).body as string);
  }

  it('带图片消息：用户片段落库，wire 下发 image_url data URL', async () => {
    seedModel(['chat', 'vision']);
    const assistant = createAssistantsService({ db, cipher }).list()[0]!;
    const attachment = createAttachmentService({ db, cipher }).save({
      filename: 'shot.png',
      mimeType: 'image/png',
      buffer: PNG_BYTES,
    });
    fetchMock.mockResolvedValue(
      new Response(SSE_BODY, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    );

    const events = await drain(
      createChatOrchestrator({ db, cipher }).streamChat({
        assistantId: assistant.id,
        content: '这是什么',
        attachments: [attachment.id],
      }),
    );

    expect(events.map((e) => e.event)).toEqual(['meta', 'delta', 'done']);
    const body = lastRequestBody();
    const userMessage = body.messages.at(-1)!;
    expect(userMessage.content).toEqual([
      { type: 'text', text: '这是什么' },
      {
        type: 'image_url',
        image_url: {
          url: `data:image/png;base64,${Buffer.from(PNG_BYTES).toString('base64')}`,
          detail: 'auto',
        },
      },
    ]);

    const meta = events[0]!.data as { conversationId: string };
    const messages = createConversationService({ db, cipher }).listMessages(meta.conversationId);
    expect(messages[0]!.contentParts).toEqual([
      { type: 'text', text: '这是什么' },
      { type: 'image', attachmentId: attachment.id },
    ]);
  });

  it('非视觉模型带图片：开流前 422 拦截，不落任何消息、不调模型', async () => {
    seedModel(['chat']);
    const assistant = createAssistantsService({ db, cipher }).list()[0]!;
    const attachment = createAttachmentService({ db, cipher }).save({
      filename: 'shot.png',
      mimeType: 'image/png',
      buffer: PNG_BYTES,
    });

    const events = await drain(
      createChatOrchestrator({ db, cipher }).streamChat({
        assistantId: assistant.id,
        content: '看图',
        attachments: [attachment.id],
      }),
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ event: 'error', data: { code: 'VALIDATION_ERROR' } });
    expect((events[0]!.data as { message: string }).message).toContain('不支持图片');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('重新生成：沿用原图片片段再次下发', async () => {
    seedModel(['chat', 'vision']);
    const assistant = createAssistantsService({ db, cipher }).list()[0]!;
    const attachment = createAttachmentService({ db, cipher }).save({
      filename: 'shot.png',
      mimeType: 'image/png',
      buffer: PNG_BYTES,
    });
    const orchestrator = createChatOrchestrator({ db, cipher });
    fetchMock.mockResolvedValue(
      new Response(SSE_BODY, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    );

    const first = await drain(
      orchestrator.streamChat({
        assistantId: assistant.id,
        content: '看图',
        attachments: [attachment.id],
      }),
    );
    const conversationId = (first[0]!.data as { conversationId: string }).conversationId;

    const second = await drain(
      orchestrator.streamChat({ assistantId: assistant.id, conversationId, regenerate: true }),
    );
    expect(second.at(-1)).toMatchObject({ event: 'done' });
    const userMessage = lastRequestBody().messages.find((m) => m.role === 'user')!;
    expect(JSON.stringify(userMessage.content)).toContain('data:image/png;base64,');
  });
});
