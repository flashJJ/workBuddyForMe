import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDatabase,
  createModelRepository,
  createProviderRepository,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createSettingsService, createWebCipher } from '@wbfm/core';
import { __buildContainerForTest, __setContainerForTest } from '@/lib/server/container';
import { parseSseChunks } from '@/lib/server/sse-stream';
import { POST as createConversation } from '../../route';
import { POST as streamChat } from '../../../chat/stream/route';
import { GET as exportConversation } from './route';

const SSE_BODY =
  'data: {"choices":[{"delta":{"content":"回答内容"}}]}\n\n' +
  'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}\n\n' +
  'data: [DONE]\n\n';

const jsonRequest = (body: unknown) =>
  new Request('http://127.0.0.1/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
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

describe('M2 对话分享导出 API 集成', () => {
  let db: ReturnType<typeof createDatabase>;
  let assistantId: string;
  let conversationId: string;

  beforeEach(async () => {
    setDataRootForTest(mkdtempSync(join(tmpdir(), 'wbfm-m2-')));
    db = createDatabase(':memory:');
    const services = __buildContainerForTest(db, createWebCipher());
    assistantId = services.assistants.list()[0]!.id;
    // 准备一条含问答的真实会话（经 orchestrator/stream 落库）
    const created = await createConversation(jsonRequest({ assistantId, title: '分享验证' }));
    conversationId = (await created.json()).data.id;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(SSE_BODY, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
      ),
    );
    // 给 settings 配一个可用对话模型（流式落库链路前置条件）
    const provider = createProviderRepository(db).create({
      name: 'p', protocol: 'openai-compatible', baseUrl: 'https://api.example.com/v1',
      apiKeyCipher: '', enabled: true, sortOrder: 0,
    });
    const model = createModelRepository(db).create({
      providerId: provider.id, modelId: 'gpt-test', capabilities: ['chat'], contextWindow: null,
    });
    createSettingsService({ db, cipher: createWebCipher() }).update({ defaultChatModelId: model.id });
    const stream = await streamChat(jsonRequest({ assistantId, content: '你好', conversationId }));
    const events = parseSseChunks(await readAll(stream));
    expect(events.at(-1)!.event).toBe('done');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
  });

  it('format=markdown：200 + text/markdown + 文件名/水印/角色标注', async () => {
    const res = await exportConversation(
      new Request('http://x/export?format=markdown'),
      { params: Promise.resolve({ id: conversationId }) },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/markdown');
    expect(res.headers.get('content-disposition')).toContain(
      `filename*=UTF-8''${encodeURIComponent('分享验证')}.md`,
    );
    const body = await res.text();
    expect(body).toContain('# 分享验证');
    expect(body).toContain('### 🧑 用户');
    expect(body).toContain('回答内容');
    expect(body).toMatch(/由 WorkBuddy For Me v\d+\.\d+\.\d+ 生成/);
  });

  it('format=html：200 + text/html 单文件（内联 style，无 link）', async () => {
    const res = await exportConversation(
      new Request('http://x/export?format=html'),
      { params: Promise.resolve({ id: conversationId }) },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(res.headers.get('content-disposition')).toContain(
      `filename*=UTF-8''${encodeURIComponent('分享验证')}.html`,
    );
    const body = await res.text();
    expect(body).toContain('<!DOCTYPE html>');
    expect(body).toContain('<style>');
    expect(body).not.toContain('<link');
  });

  it('会话不存在 → 404；非法 format → 422', async () => {
    const missing = await exportConversation(
      new Request('http://x/export?format=html'),
      { params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }) },
    );
    expect(missing.status).toBe(404);

    const bad = await exportConversation(
      new Request('http://x/export?format=pdf'),
      { params: Promise.resolve({ id: conversationId }) },
    );
    expect(bad.status).toBe(422);
  });
});
