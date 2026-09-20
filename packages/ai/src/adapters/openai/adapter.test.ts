import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOpenAiCompatibleAdapter, type ProviderConnection } from '../../index';

const CONNECTION: ProviderConnection = {
  protocol: 'openai-compatible',
  baseUrl: 'https://api.x.com/v1',
  apiKey: 'sk-test',
};

describe('OpenAI 适配器 testConnection / listModels', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('listModels 拉取并排序，testConnection 成功', async () => {
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Response(
          JSON.stringify({ data: [{ id: 'gpt-4' }, { id: 'gpt-3.5' }, { id: 'gpt-4o' }] }),
          { headers: { 'content-type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const adapter = createOpenAiCompatibleAdapter(CONNECTION);
    const models = await adapter.listModels();
    expect(models).toEqual(['gpt-3.5', 'gpt-4', 'gpt-4o']);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.x.com/v1/models');
    expect(init.method).toBe('GET');
    await expect(adapter.testConnection()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('testConnection 失败时抛 ProviderError', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 401 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      createOpenAiCompatibleAdapter(CONNECTION).testConnection(),
    ).rejects.toMatchObject({ code: 'PROVIDER_ERROR', status: 401 });
  });
});
