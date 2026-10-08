/**
 * eval 共享前置：在 WBFM_MOCK_AI=1 的 server 上幂等准备 mock 供应商/模型/默认设置。
 * 与 Playwright critical-path 的 UI seed 等价（mock provider 由 core 按环境变量注入，
 * DB 里仍需 provider+model 记录与默认选择）。
 */
import { api } from './http.mjs';

/**
 * @returns {Promise<{providerId:string, chatModelId:string, embedModelId:string, assistantId:string}>}
 */
export async function ensureMockStack(baseUrl) {
  // 供应商：已存在同名则复用
  const providers = await api(baseUrl, '/api/providers');
  let provider = providers.find((p) => p.name === 'eval-mock');
  if (!provider) {
    provider = await api(baseUrl, '/api/providers', {
      method: 'POST',
      body: JSON.stringify({
        name: 'eval-mock',
        protocol: 'openai-compatible',
        baseUrl: 'http://mock.local/v1',
        apiKey: 'sk-mock',
      }),
    });
  }

  // 模型：列出现有，缺啥补啥；默认模型设置用模型记录 UUID（model.id），
  // 不是供应商标识 modelId——settings 服务按记录主键校验存在性。
  const models = await api(baseUrl, `/api/providers/${provider.id}/models`);
  const byModelId = new Map(models.map((m) => [m.modelId, m]));
  const ensureModel = async (modelId, capabilities) => {
    const existing = byModelId.get(modelId);
    if (existing) return existing;
    const created = await api(baseUrl, `/api/providers/${provider.id}/models`, {
      method: 'POST',
      body: JSON.stringify({ modelId, capabilities }),
    });
    byModelId.set(modelId, created);
    return created;
  };
  const chatModel = await ensureModel('mock-chat', ['chat']);
  const embedModel = await ensureModel('mock-embed', ['embedding']);

  // 默认模型设置（embed 为 RAG/记忆链路所需）
  await api(baseUrl, '/api/settings', {
    method: 'PUT',
    body: JSON.stringify({
      defaultChatModelId: chatModel.id,
      defaultEmbeddingModelId: embedModel.id,
    }),
  });

  const assistants = await api(baseUrl, '/api/assistants');
  if (!assistants[0]) throw new Error('seed 后仍无助手（内置 seed 助手应存在）');
  return {
    providerId: provider.id,
    chatModelId: chatModel.id,
    embedModelId: embedModel.id,
    assistantId: assistants[0].id,
  };
}
