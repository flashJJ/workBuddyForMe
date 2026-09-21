import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProvider } from './index';
import type { ProviderConnection } from './index';

const openaiConnection: ProviderConnection = {
  protocol: 'openai-compatible',
  baseUrl: 'https://api.x.com/v1',
  apiKey: null,
};

const PROVIDER_KEYS = [
  'chatStream',
  'embed',
  'listModels',
  'supportsTools',
  'testConnection',
].sort();

describe('Provider 注册中心（TR-11.1）', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('openai-compatible 返回可用适配器，支持工具调用', () => {
    const provider = createProvider(openaiConnection);
    expect(Object.keys(provider).sort()).toEqual(PROVIDER_KEYS);
    expect(provider.supportsTools).toBe(true);
  });

  it('ollama 返回本地适配器：列表走原生 /api/tags，支持工具调用', async () => {
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Response(JSON.stringify({ models: [{ name: 'qwen2.5:7b' }, { name: 'llama3.1:8b' }] }), {
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const provider = createProvider({
      protocol: 'ollama',
      baseUrl: 'http://127.0.0.1:11434',
      apiKey: null,
    });
    expect(Object.keys(provider).sort()).toEqual(PROVIDER_KEYS);
    expect(provider.supportsTools).toBe(true);

    const models = await provider.listModels();
    expect(models).toEqual(['llama3.1:8b', 'qwen2.5:7b']);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://127.0.0.1:11434/api/tags');
    // 本地无 Key 时不应带 Authorization
    expect((init.headers as Headers).get('authorization')).toBeNull();
    await expect(provider.testConnection()).resolves.toBeUndefined();
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
