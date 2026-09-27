import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, vi } from 'vitest';
import {
  createDatabase,
  createModelRepository,
  createProviderRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher, type SecretCipher } from '../secrets/cipher';
import { createAssistantsService } from '../services/assistant-service';
import { createSettingsService } from '../services/settings-service';
import type { createPendingConfirmations } from '../services/pending-confirmations';
import type { OrchestratorEvent } from './types';

/** 触发 fetch_webpage（danger）工具调用；URL 用回环地址：SSRF 守卫同步拦截，工具执行零网络 */
export function fetchToolCallSse(): string {
  const head = {
    choices: [
      {
        delta: {
          tool_calls: [
            {
              index: 0,
              id: 'call-hitl',
              type: 'function',
              function: { name: 'fetch_webpage', arguments: '' },
            },
          ],
        },
      },
    ],
  };
  const tail = {
    choices: [
      {
        delta: {
          tool_calls: [{ index: 0, function: { arguments: '{"url":"http://127.0.0.1/"}' } }],
        },
        finish_reason: 'tool_calls',
      },
    ],
  };
  return `data: ${JSON.stringify(head)}\n\ndata: ${JSON.stringify(tail)}\n\ndata: [DONE]\n\n`;
}

export function answerSse(text: string): string {
  const delta = { choices: [{ delta: { content: text } }] };
  const usage = {
    choices: [{ delta: {} }],
    usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 },
  };
  return `data: ${JSON.stringify(delta)}\n\ndata: ${JSON.stringify(usage)}\n\ndata: [DONE]\n\n`;
}

/** 手动驱动生成器：遇到确认事件时用给定决策 resolve，再继续排空 */
export async function drainWithDecision(
  generator: AsyncGenerator<OrchestratorEvent>,
  confirmations: ReturnType<typeof createPendingConfirmations>,
  decision: 'allow' | 'deny',
) {
  const events: OrchestratorEvent[] = [];
  let step = await generator.next();
  while (!step.done) {
    events.push(step.value);
    if (step.value.event === 'tool_confirmation_required') {
      const callId = (step.value.data as { callId: string }).callId;
      expect(confirmations.resolve(callId, decision)).toBe(true);
    }
    step = await generator.next();
  }
  return events;
}

export interface HitlFixture {
  db: DatabaseInstance;
  cipher: SecretCipher;
  fetchMock: ReturnType<typeof vi.fn>;
  assistantId: string;
}

export function setupHitlFixture(): HitlFixture {
  const tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-hitl-'));
  setDataRootForTest(tempRoot);
  const db = createDatabase(':memory:');
  const cipher = createWebCipher();
  const fetchMock = vi.fn();
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
  const assistants = createAssistantsService({ db, cipher });
  const assistant = assistants.list()[0]!;
  assistants.update(assistant.id, { memoryEnabled: false, enabledTools: ['fetch_webpage'] });
  return { db, cipher, fetchMock, assistantId: assistant.id };
}

export function teardownHitlFixture(db: DatabaseInstance): void {
  vi.unstubAllGlobals();
  db.close();
  resetDataRootForTest();
}

export function mockTwoRounds(fetchMock: ReturnType<typeof vi.fn>, finalText: string): void {
  fetchMock
    .mockImplementationOnce(
      () => new Response(fetchToolCallSse(), { headers: { 'content-type': 'text/event-stream' } }),
    )
    .mockImplementationOnce(
      () => new Response(answerSse(finalText), { headers: { 'content-type': 'text/event-stream' } }),
    );
}
