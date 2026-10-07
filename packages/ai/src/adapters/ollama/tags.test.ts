import { afterEach, describe, expect, it, vi } from 'vitest';
import { ollamaListModels } from './tags';

const CONNECTION = {
  protocol: 'ollama' as const,
  baseUrl: 'http://127.0.0.1:11434',
  apiKey: null,
};

describe('ollamaListModels', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('忽略 details.context_length（架构上限），统一按运行时默认 num_ctx=4096 上报', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [
          { name: 'qwen2.5:14b-instruct-q4_K_M', details: { context_length: 32768 } },
          { name: 'qwen2.5:7b' },
        ],
      }),
    } as unknown as Response);

    const models = await ollamaListModels(CONNECTION);

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(models.map((m) => m.id)).toEqual([
      'qwen2.5:14b-instruct-q4_K_M',
      'qwen2.5:7b',
    ]);
    expect(models.every((m) => m.contextLength === 4096)).toBe(true);
  });

  it('空列表与异常响应字段安全降级为空数组', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as unknown as Response);
    await expect(ollamaListModels(CONNECTION)).resolves.toEqual([]);
  });
});
