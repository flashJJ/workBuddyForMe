import type { ChatProvider, ProviderConnection } from '../../types';
import { openAiChatStream } from './chat-stream';
import { openAiEmbed } from './embeddings';
import { openAiListModels } from './list-models';

/** 构造 OpenAI 兼容协议适配器（ChatGPT/DeepSeek/通义/自建 vLLM 等） */
export function createOpenAiCompatibleAdapter(
  connection: ProviderConnection,
): ChatProvider {
  return {
    testConnection: async (signal) => {
      await openAiListModels(connection, signal);
    },
    listModels: (signal) => openAiListModels(connection, signal),
    chatStream: (params) => openAiChatStream(connection, params),
    embed: (params) => openAiEmbed(connection, params),
  };
}
