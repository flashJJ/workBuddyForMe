import type { ChatProvider, ProviderConnection } from '../../types';
import { createOpenAiCompatibleAdapter } from '../openai/adapter';
import { ollamaListModels } from './tags';
import { normalizeOllamaBaseUrl } from './url';

/**
 * Ollama 适配器（v0.2 起）：
 * - 模型列表/连接探活：原生 /api/tags
 * - 对话流式/向量化：复用 Ollama 内置 OpenAI 兼容端点（/v1）
 * - 工具调用：Ollama 0.3+ 经兼容端点支持 function calling
 * - v0.3 视觉：视觉消息（image_url data URL）经 /v1 透传。
 *   M1 真机实测（Ollama + qwen2.5vl:7b，2026-05）：/v1/chat/completions
 *   正确消费 data URL 图片（纯色图被准确描述、prompt_tokens 含图像），
 *   因此无需转原生 /api/chat 的 images 字段。
 */
export function createOllamaAdapter(connection: ProviderConnection): ChatProvider {
  const openAiConnection: ProviderConnection = {
    ...connection,
    baseUrl: normalizeOllamaBaseUrl(connection.baseUrl),
  };
  const openAi = createOpenAiCompatibleAdapter(openAiConnection);

  return {
    supportsTools: true,
    testConnection: async (signal) => {
      await ollamaListModels(connection, signal);
    },
    listModels: (signal) => ollamaListModels(connection, signal),
    chatStream: (params) => openAi.chatStream(params),
    embed: (params) => openAi.embed(params),
  };
}
