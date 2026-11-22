import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { createWebCipher, type SecretCipher } from '../../secrets/cipher';
import { createMemoryService } from '../memory-service';
import type { ExtractedMemory } from '../extractor';
import { resolveEmbeddingTarget } from '../../ingestion/embedding-target';

vi.mock('../../ingestion/embedding-target', () => ({
  resolveEmbeddingTarget: vi.fn(),
}));

function fact(content: string): ExtractedMemory {
  return { kind: 'fact', content, importance: 0.5 };
}

describe('v4.21 统一召回入口', () => {
  let db: DatabaseInstance;
  let cipher: SecretCipher;

  beforeEach(() => {
    db = createDatabase(':memory:');
    cipher = createWebCipher();
    vi.clearAllMocks();
    vi.mocked(resolveEmbeddingTarget).mockReturnValue(null);
  });

  it('显式预算裁剪候选，空查询不写召回统计', async () => {
    const memory = createMemoryService({ db, cipher });
    await memory.rememberCandidates([
      fact('用户喜欢猫'),
      fact('用户喜欢狗'),
      fact('用户喜欢鱼'),
    ]);
    const before = memory.getStats().recallTotal;

    expect(await memory.recall({ query: '   ' })).toEqual([]);
    expect(memory.getStats().recallTotal).toBe(before);

    const one = await memory.recall({ query: '喜欢什么', budget: { maxItems: 1 } });
    expect(one).toHaveLength(1);
    const all = await memory.recall({ query: '喜欢什么' });
    expect(all).toHaveLength(2);
  });

  it('解释轨迹只保留元数据，最近 5 次且不含正文/查询原文', async () => {
    const memory = createMemoryService({ db, cipher });
    await memory.rememberCandidates([fact('用户喜欢猫')]);

    for (let index = 0; index < 7; index += 1) {
      await memory.recall({ query: '喜欢什么', scene: 'intent-forget' });
    }
    const traces = memory.getRecallTraces();
    expect(traces).toHaveLength(5);
    expect(traces[0]).toMatchObject({
      scene: 'intent-forget',
      queryLength: 4,
      selected: 1,
    });
    const keys = Object.keys(traces[0]!);
    expect(keys).not.toContain('query');
    expect(keys).not.toContain('content');
    expect(JSON.stringify(traces)).not.toContain('用户喜欢猫');
  });
});
