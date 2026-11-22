import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabase, getMemoryVectorDimension, type DatabaseInstance } from '@wbfm/database';
import { createWebCipher, type SecretCipher } from '../../secrets/cipher';
import { createMemoryService } from '../memory-service';
import {
  resolveEmbeddingTarget,
  type ResolvedEmbeddingTarget,
} from '../../ingestion/embedding-target';
import type { ExtractedMemory } from '../extractor';

vi.mock('../../ingestion/embedding-target', () => ({
  resolveEmbeddingTarget: vi.fn(),
}));

describe('记忆向量维度变化（v4.16）', () => {
  let db: DatabaseInstance;
  let cipher: SecretCipher;

  beforeEach(() => {
    db = createDatabase(':memory:');
    cipher = createWebCipher();
    vi.clearAllMocks();
  });

  /** 按批次返回向量（批次内每条输入一个向量） */
  function mockEmbedding(batches: number[][][]) {
    let index = 0;
    const embed = vi.fn(async ({ input }: { input: string[] }) => {
      const vectors = batches[index] ?? input.map(() => [0, 1]);
      index += 1;
      return { vectors, dimension: vectors[0]?.length ?? 0 };
    });
    vi.mocked(resolveEmbeddingTarget).mockReturnValue({
      provider: { embed } as unknown as ResolvedEmbeddingTarget['provider'],
      model: { modelId: 'emb' } as unknown as ResolvedEmbeddingTarget['model'],
    });
  }

  it('维度从 3 变为 2：召回降级关键词，新建/编辑/自动写入均不失败', async () => {
    mockEmbedding([[[1, 0, 0]]]);
    const memory = createMemoryService({ db, cipher });
    const created = await memory.createManual({
      kind: 'fact',
      content: '用户住在杭州',
      importance: 0.6,
    });
    expect(getMemoryVectorDimension(db)).toBe(3);

    // 新嵌入模型返回 2 维向量，与旧向量表不一致
    mockEmbedding([[[1, 0]], [[0, 1]], [[0.5, 0.5]], [[0.2, 0.8]]]);
    const recalled = await memory.recall({ query: '杭州' });
    expect(recalled.map((item) => item.id)).toContain(created.id);

    const manual = await memory.createManual({
      kind: 'fact',
      content: '用户喜欢咖啡',
      importance: 0.4,
    });
    const updated = await memory.update(manual.id, { content: '用户喜欢拿铁' });
    expect(updated?.content).toBe('用户喜欢拿铁');

    const remembered = await memory.rememberCandidates([
      { kind: 'fact', content: '用户喜欢喝茶', importance: 0.5 } as ExtractedMemory,
    ]);
    expect(remembered.created).toBe(1);
    expect(memory.list()).toHaveLength(3);
    // 旧向量表保持原维度，等待用户重建
    expect(getMemoryVectorDimension(db)).toBe(3);
  });
});
