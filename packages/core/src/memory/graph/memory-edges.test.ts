import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabase, createMemoryEdgeRepository, type DatabaseInstance } from '@wbfm/database';
import type { Memory } from '@wbfm/shared/types';
import type { SecretCipher } from '../../secrets/cipher';
import { createWebCipher } from '../../secrets/cipher';
import { buildSameSourceEdges } from './memory-edges';
import { createMemoryService } from '../memory-service';
import type { ExtractedMemory } from '../extractor';
import { resolveEmbeddingTarget } from '../../ingestion/embedding-target';

vi.mock('../../ingestion/embedding-target', () => ({
  resolveEmbeddingTarget: vi.fn(),
}));

function memoryOf(id: string, patch: Partial<Memory> = {}): Memory {
  return {
    id,
    kind: 'fact',
    content: `记忆 ${id}`,
    importance: 0.5,
    status: 'active',
    pinned: false,
    ...patch,
  } as Memory;
}

function fact(content: string): ExtractedMemory {
  return { kind: 'fact', content, importance: 0.5 };
}

describe('关系边构建（纯函数）', () => {
  it('同消息的多条记忆两两建边，按 id 升序规范化', () => {
    const edges = buildSameSourceEdges([memoryOf('3'), memoryOf('1'), memoryOf('2')], 'm-1');
    expect(edges).toEqual([
      { fromId: '1', toId: '3', relation: 'same_source', weight: 0.8 },
      { fromId: '2', toId: '3', relation: 'same_source', weight: 0.8 },
      { fromId: '1', toId: '2', relation: 'same_source', weight: 0.8 },
    ]);
  });

  it('缺少来源消息、约束、置顶与归档记忆不参与建边', () => {
    expect(buildSameSourceEdges([memoryOf('1'), memoryOf('2')], null)).toEqual([]);
    const edges = buildSameSourceEdges(
      [
        memoryOf('1'),
        memoryOf('2', { kind: 'constraint', pinned: true }),
        memoryOf('3', { pinned: true }),
        memoryOf('4', { status: 'archived' }),
      ],
      'm-1',
    );
    expect(edges).toEqual([]);
  });
});

describe('记忆服务建边（v2.31）', () => {
  let db: DatabaseInstance;
  let cipher: SecretCipher;

  beforeEach(() => {
    db = createDatabase(':memory:');
    cipher = createWebCipher();
    vi.clearAllMocks();
    vi.mocked(resolveEmbeddingTarget).mockReturnValue(null);
  });

  it('同一消息写入 3 条记忆产生 3 条边；无来源消息不建边', async () => {
    const service = createMemoryService({ db, cipher });
    const edges = createMemoryEdgeRepository(db);
    await service.rememberCandidates([fact('用户喜欢猫'), fact('用户在上海'), fact('用户是工程师')], {
      sourceMessageId: 'm-1',
    });
    expect(edges.count()).toBe(3);

    await service.rememberCandidates([fact('用户喜欢徒步')]);
    expect(edges.count()).toBe(3);
  });

  it('邻居只能通过关系边召回，理由为 neighbor 且标注种子', async () => {
    const service = createMemoryService({ db, cipher });
    const result = await service.rememberCandidates(
      [fact('用户喜欢猫'), fact('用户住在杭州')],
      { sourceMessageId: 'm-1' },
    );
    const recalled = await service.recall('喜欢什么宠物');
    const neighbor = recalled.find((memory) => memory.content === '用户住在杭州');
    expect(neighbor?.reason).toBe('neighbor');
    expect(neighbor?.neighborOf).toBe(
      result.memories.find((memory) => memory.content === '用户喜欢猫')?.id,
    );
    expect(recalled.length).toBeLessThanOrEqual(3);
  });

  it('无来源消息时邻居不出现，召回退化为单跳', async () => {
    const service = createMemoryService({ db, cipher });
    await service.rememberCandidates([fact('用户喜欢猫'), fact('用户住在杭州')]);
    const recalled = await service.recall('喜欢什么宠物');
    expect(recalled.map((memory) => memory.content)).toEqual(['用户喜欢猫']);
  });

  it('删除记忆清理相关边，清空记忆库同时清空边', async () => {
    const service = createMemoryService({ db, cipher });
    const edges = createMemoryEdgeRepository(db);
    const result = await service.rememberCandidates(
      [fact('用户喜欢猫'), fact('用户在上海')],
      { sourceMessageId: 'm-1' },
    );
    expect(edges.count()).toBe(1);

    service.remove(result.memories[0]!.id);
    expect(edges.count()).toBe(0);

    await service.rememberCandidates([fact('用户喜欢猫'), fact('用户在上海')], {
      sourceMessageId: 'm-2',
    });
    expect(edges.count()).toBe(1);
    service.clearAll();
    expect(edges.count()).toBe(0);
  });
});
