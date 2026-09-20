import { ProviderError } from './errors/provider-error';
import type { ChatProvider, ProviderConnection } from './types';
import { createOpenAiCompatibleAdapter } from './adapters/openai/adapter';
import { createOllamaAdapter } from './adapters/ollama/adapter';

/** 按协议类型解析适配器；未启用/未知协议抛结构化错误 */
export function createProvider(connection: ProviderConnection): ChatProvider {
  switch (connection.protocol) {
    case 'openai-compatible':
      return createOpenAiCompatibleAdapter(connection);
    case 'ollama':
      return createOllamaAdapter(connection);
    default: {
      // 运行期数据可能绕过 TS 传入未知协议
      throw ProviderError.unsupported(String((connection as { protocol: string }).protocol));
    }
  }
}
