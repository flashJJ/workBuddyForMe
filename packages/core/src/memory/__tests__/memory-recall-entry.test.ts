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
});
