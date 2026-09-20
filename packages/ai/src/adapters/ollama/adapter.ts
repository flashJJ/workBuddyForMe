import { ProviderError } from '../../errors/provider-error';
import type { ChatProvider, ProviderConnection } from '../../types';

/**
 * Ollama 适配器占位：接口已预留，但当前版本未启用。
 * 所有方法均抛出结构化 UNSUPPORTED_PROVIDER 错误，前端可识别并提示。
 */
export function createOllamaAdapter(_connection: ProviderConnection): ChatProvider {
  const notEnabled = (): never => {
    throw ProviderError.unsupported('ollama');
  };
  return {
    testConnection: async () => notEnabled(),
    listModels: async () => notEnabled(),
    chatStream: () => notEnabled(),
    embed: async () => notEnabled(),
  };
}
