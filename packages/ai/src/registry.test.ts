import { describe, expect, it } from 'vitest';
import { createProvider } from './index';
import type { ChatProvider, ProviderConnection } from './index';

const openaiConnection: ProviderConnection = {
  protocol: 'openai-compatible',
  baseUrl: 'https://api.x.com/v1',
  apiKey: null,
};

const PROVIDER_METHODS = ['chatStream', 'embed', 'listModels', 'testConnection'].sort();

describe('Provider 注册中心（TR-11.1）', () => {
  it('openai-compatible 返回可用适配器', () => {
    const provider = createProvider(openaiConnection);
    expect(Object.keys(provider).sort()).toEqual(PROVIDER_METHODS);
    expect(typeof (provider as ChatProvider).chatStream).toBe('function');
  });

  it('ollama 适配器所有方法抛结构化未启用错误', async () => {
    const provider = createProvider({ ...openaiConnection, protocol: 'ollama' });
    expect(Object.keys(provider).sort()).toEqual(PROVIDER_METHODS);
    await expect(provider.testConnection()).rejects.toMatchObject({
      code: 'UNSUPPORTED_PROVIDER',
      status: undefined,
    });
    await expect(provider.listModels()).rejects.toMatchObject({
      code: 'UNSUPPORTED_PROVIDER',
    });
    await expect(
      provider.embed({ model: 'm', input: ['x'] }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_PROVIDER' });
    expect(() => {
      const iterable = provider.chatStream({ model: 'm', messages: [] });
      return iterable[Symbol.asyncIterator]().next();
    }).toThrow(/尚未启用/);
  });

  it('未知协议抛结构化错误', () => {
    expect(() =>
      createProvider({
        ...openaiConnection,
        protocol: 'anthropic' as unknown as ProviderConnection['protocol'],
      }),
    ).toThrow(/anthropic/);
  });
});
