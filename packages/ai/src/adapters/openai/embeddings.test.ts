import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EMBED_BATCH_SIZE,
  createOpenAiCompatibleAdapter,
  type ProviderConnection,
} from '../../index';

const CONNECTION: ProviderConnection = {
  protocol: 'openai-compatible',
  baseUrl: 'https://api.x.com/v1',
  apiKey: 'sk-test',
};

describe('OpenAI 兼容 embeddings（TR-10.2）', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('维度透传、按批大小分批、乱序 index 还原顺序', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async (url: string, init: RequestInit) => {
        const payload = JSON.parse(init.body as string) as {
          model: string;
          input: string[];
        };
        expect(url).toBe('https://api.x.com/v1/embeddings');
        expect(payload.model).toBe('embed-x');
        // 故意乱序返回，验证 index 归位
        const data = payload.input
          .map((_text, i) => ({ index: i, embedding: [i + 0.1, i + 0.2, i + 0.3] }))
          .reverse();
        return new Response(JSON.stringify({ data }), {
          headers: { 'content-type': 'application/json' },
        });
      });
    vi.stubGlobal('fetch', fetchMock);

    const total = EMBED_BATCH_SIZE + 1;
    const texts = Array.from({ length: total }, (_v, i) => `text-${i}`);
    const result = await createOpenAiCompatibleAdapter(CONNECTION).embed({
      model: 'embed-x',
      input: texts,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    const secondBody = JSON.parse(fetchMock.mock.calls[1]![1].body as string);
    expect(firstBody.input).toHaveLength(EMBED_BATCH_SIZE);
    expect(secondBody.input).toHaveLength(1);

    expect(result.vectors).toHaveLength(total);
    expect(result.dimension).toBe(3);
    // index 在批次内归位（mock 按批内 i 生成），跨批 offset 正确
    expect(result.vectors[0]).toEqual([0.1, 0.2, 0.3]);
    expect(result.vectors[63]).toEqual([63.1, 63.2, 63.3]);
    expect(result.vectors[64]).toEqual([0.1, 0.2, 0.3]);
  });

  it('空输入直接返回，不发起请求', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await createOpenAiCompatibleAdapter(CONNECTION).embed({
      model: 'embed-x',
      input: [],
    });
    expect(result).toEqual({ vectors: [], dimension: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('维度不一致时报错', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { index: 0, embedding: [1, 2, 3] },
            { index: 1, embedding: [1, 2] },
          ],
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      createOpenAiCompatibleAdapter(CONNECTION).embed({
        model: 'embed-x',
        input: ['a', 'b'],
      }),
    ).rejects.toThrow(/维度不一致/);
  });
});
