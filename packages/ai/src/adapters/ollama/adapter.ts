import type { ChatProvider, ProviderConnection } from '../../types';
import { createOpenAiCompatibleAdapter } from '../openai/adapter';
import { ollamaListModels } from './tags';
import { normalizeOllamaBaseUrl } from './url';

/**
 * Ollama 适配器（v0.2）：
 * - 模型列表/连接探活：原生 /api/tags
 * - 对话流式/向量化：复用 Ollama 内置 OpenAI 兼容端点（/v1）
 * - 工具调用：Ollama 0.3+ 经兼容端点支持 function calling
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
