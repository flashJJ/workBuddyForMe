/**
 * eval 共享前置：在 WBFM_MOCK_AI=1 的 server 上幂等准备 mock 供应商/模型/默认设置。
 * 与 Playwright critical-path 的 UI seed 等价（mock provider 由 core 按环境变量注入，
 * DB 里仍需 provider+model 记录与默认选择）。
 */
import { api } from './http.mjs';

/**
 * @returns {Promise<{providerId:string, chatModelId:string, embedModelId:string, assistantId:string}>}
 * @param {{chatContextWindow?:number|null}} [options] 验收场景可显式声明模型窗口，
 *   使预算/折叠链路按真实窗口运行（缺省沿用 mock 的 null → 生效窗口回落 8K）
 */
export async function ensureMockStack(baseUrl, options = {}) {
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
      body: JSON.stringify({
        modelId,
        capabilities,
        ...(options.chatContextWindow && modelId === 'mock-chat'
          ? { contextWindow: options.chatContextWindow }
          : {}),
      }),
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

/**
 * v4.11 P1-4：准备不同上下文窗口的模型与助手（8K / 128K / 1M 三档验收）。
 *
 * 同一供应商内 modelId 唯一，因此每档用独立 modelId；mock 供应商不区分模型，
 * 差异只体现在模型记录的 contextWindow 上，由真实预算/折叠链路读取。
 * @param {string} baseUrl
 * @param {string} providerId `ensureMockStack` 返回的供应商记录 id
 * @param {Array<{key:string, modelId:string, contextWindow:number}>} tiers
 * @returns {Promise<Record<string, {modelRecordId:string, assistantId:string}>>}
 */
export async function ensureWindowTiers(baseUrl, providerId, tiers) {
  const models = await api(baseUrl, `/api/providers/${providerId}/models`);
  const modelsByModelId = new Map(models.map((item) => [item.modelId, item]));
  const assistants = await api(baseUrl, '/api/assistants');
  const assistantsByName = new Map(assistants.map((item) => [item.name, item]));

  /** @type {Record<string, {modelRecordId:string, assistantId:string}>} */
  const result = {};
  for (const tier of tiers) {
    let model = modelsByModelId.get(tier.modelId);
    if (!model) {
      model = await api(baseUrl, `/api/providers/${providerId}/models`, {
        method: 'POST',
        body: JSON.stringify({
          modelId: tier.modelId,
          capabilities: ['chat'],
          contextWindow: tier.contextWindow,
        }),
      });
      modelsByModelId.set(model.modelId, model);
    }

    // 每个窗口独立助手：避免用例之间互相改写绑定，且可并行观察不同预算
    const name = `acceptance-${tier.key}`;
    let assistant = assistantsByName.get(name);
    if (!assistant) {
      assistant = await api(baseUrl, '/api/assistants', {
        method: 'POST',
        body: JSON.stringify({
          name,
          modelId: model.id,
          enabledTools: ['fetch_webpage'],
          knowledgeBaseIds: [],
          retrieveAlways: false,
        }),
      });
      assistantsByName.set(name, assistant);
    }

    result[tier.key] = { modelRecordId: model.id, assistantId: assistant.id };
  }
  return result;
}
