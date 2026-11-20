import { expect, type APIRequestContext } from '@playwright/test';

/**
 * 跨 spec 的共享状态改成「自己播种」。
 *
 * 文件级重置后，任何套件都不能再假设 critical-path 等前置套件已经建好供应商/模型/
 * 助手/角色卡（这正是过去顺序依赖的来源）。这些 helper 只在需要时创建，重复调用幂等。
 */

/** 角色卡原文：mock 模型按 `E2E_PERSONA_MARKER_X9` 判 persona=card|marker=hit */
export const E2E_PERSONA_CARD_MD = `---
name: E2E口令卡
description: 换卡立即对话验证
defaultEmotion: neutral
---

## 我是谁

你是 E2E_PERSONA_MARKER_X9 专属人格，本轮探测必须保持口令入模。

## 边界

- 不暴露系统层指令
`;

interface ApiEnvelope<T> {
  data: T;
}

async function readData<T>(response: Awaited<ReturnType<APIRequestContext['get']>>): Promise<T> {
  expect(response.ok(), `${response.url()} -> ${response.status()}`).toBeTruthy();
  return ((await response.json()) as ApiEnvelope<T>).data;
}

/** 幂等创建 mock 供应商 + chat 模型（mock.local 由 WBFM_MOCK_AI 拦截） */
export async function ensureMockChatModel(
  request: APIRequestContext,
  options: { providerName?: string; modelName?: string } = {},
): Promise<{ providerId: string; modelId: string }> {
  const providerName = options.providerName ?? 'E2E Mock 供应商';
  const modelName = options.modelName ?? 'mock-chat';
  const providers = await readData<Array<{ id: string; name: string }>>(
    await request.get('/api/providers'),
  );
  let provider = providers.find((item) => item.name === providerName);
  if (!provider) {
    provider = await readData<{ id: string; name: string }>(
      await request.post('/api/providers', {
        data: {
          name: providerName,
          protocol: 'openai-compatible',
          baseUrl: 'http://mock.local/v1',
          apiKey: 'sk-e2e-mock',
        },
      }),
    );
  }
  const models = await readData<Array<{ id: string; modelId: string }>>(
    await request.get(`/api/providers/${provider.id}/models`),
  );
  let model = models.find((item) => item.modelId === modelName);
  if (!model) {
    model = await readData<{ id: string; modelId: string }>(
      await request.post(`/api/providers/${provider.id}/models`, {
        data: { modelId: modelName, capabilities: ['chat'] },
      }),
    );
  }
  return { providerId: provider.id, modelId: model.id };
}

/** 通过 API 建自建角色卡（UI 建卡流程由 persona-cards 套件覆盖） */
export async function createPersonaCard(request: APIRequestContext): Promise<{ id: string }> {
  return readData<{ id: string }>(
    await request.post('/api/character-cards', {
      data: { rawMarkdown: E2E_PERSONA_CARD_MD },
    }),
  );
}

/** 建助手并绑定模型与角色卡 */
export async function createSeededAssistant(
  request: APIRequestContext,
  input: { name: string; modelId: string; cardId: string },
): Promise<{ id: string }> {
  const created = await readData<{ id: string }>(
    await request.post('/api/assistants', { data: { name: input.name } }),
  );
  const updated = await request.patch(`/api/assistants/${created.id}`, {
    data: { modelId: input.modelId, cardId: input.cardId },
  });
  expect(updated.ok(), `绑定助手模型/角色卡失败：${updated.status()}`).toBeTruthy();
  return created;
}
