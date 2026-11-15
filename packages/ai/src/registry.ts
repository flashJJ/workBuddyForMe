import { ProviderError } from './errors/provider-error';
import type { ChatProvider, ProviderConnection } from './types';
import { createOpenAiCompatibleAdapter } from './adapters/openai/adapter';
import { createOllamaAdapter } from './adapters/ollama/adapter';

/** v3.1：协议 → 适配器工厂；新增协议只注册，不再改 createProvider */
export type ProviderFactory = (connection: ProviderConnection) => ChatProvider;

const PROVIDER_FACTORIES = new Map<string, ProviderFactory>([
  ['openai-compatible', createOpenAiCompatibleAdapter],
  ['ollama', createOllamaAdapter],
]);

/** 注册新协议；拒绝覆盖已有协议，避免运行期隐式替换 */
export function registerProviderFactory(protocol: string, factory: ProviderFactory): void {
  if (PROVIDER_FACTORIES.has(protocol)) {
    throw new ProviderError({ code: 'PROVIDER_ERROR', message: `协议已注册：${protocol}` });
  }
  PROVIDER_FACTORIES.set(protocol, factory);
}

/** 按协议类型解析适配器；未注册协议抛结构化错误 */
export function createProvider(connection: ProviderConnection): ChatProvider {
  const factory = PROVIDER_FACTORIES.get(connection.protocol);
  if (!factory) {
    // 运行期数据可能绕过 TS 传入未知协议
    throw ProviderError.unsupported(String((connection as { protocol: string }).protocol));
  }
  return factory(connection);
}
