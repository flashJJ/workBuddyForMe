import {
  createConversationRepository,
  createMessageRepository,
  createModelRepository,
  createProviderRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import type { SecretCipher } from '../secrets/cipher';
import { createAssistantsService } from '../services/assistant-service';
import { createSettingsService } from '../services/settings-service';
import type { OrchestratorEvent } from './types';

export const encoder = new TextEncoder();

export function sse(delta: string): string {
  return (
    `data: {"choices":[{"delta":{"content":"${delta}"}}]}\n\n` +
    'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n' +
    'data: [DONE]\n\n'
  );
}

export async function drain(generator: AsyncGenerator<OrchestratorEvent>) {
  const events: OrchestratorEvent[] = [];
  for await (const event of generator) events.push(event);
  return events;
}

/** 小上下文窗口 + 6 轮长历史：回合后必然越过 0.7 触发线 */
export function seedLongConversation(
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
  const assistantService = createAssistantsService({ db, cipher });
  const assistant = assistantService.list()[0]!;
  // 压缩用例隔离长期记忆：关闭开关，避免回合后提取额外占用 fetch mock 队列
  assistantService.update(assistant.id, { memoryEnabled: false });
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
