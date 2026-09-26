import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { createWebCipher, type SecretCipher } from '../secrets/cipher';
import { getMemoryVectorDimension, searchMemoryVectors } from '@wbfm/database';
import { createMemoryService } from './memory-service';
import type { ExtractedMemory } from './extractor';
import { resolveEmbeddingTarget, type ResolvedEmbeddingTarget } from '../ingestion/embedding-target';

vi.mock('../ingestion/embedding-target', () => ({
  resolveEmbeddingTarget: vi.fn(),
}));

const A = [1, 0, 0];
const NEAR_A = [0.99, 0.14, 0];
const ORTHOGONAL = [0, 1, 0];

function fact(content: string, importance = 0.5, vector?: number[]): ExtractedMemory {
  void vector;
  return { kind: 'fact', content, importance };
}

describe('M3 长期记忆服务', () => {
  let db: DatabaseInstance;
  let cipher: SecretCipher;

  beforeEach(() => {
    db = createDatabase(':memory:');
    cipher = createWebCipher();
    vi.clearAllMocks();
  });

  /**
   * 按 embed 调用批次返回向量：callVectors[n] 为第 n 次调用中每条输入对应的向量。
   * 超出预设批次时退化为正交向量。
   */
  function mockEmbeddingByCall(callVectors: number[][][]) {
    let callIndex = 0;
    const embed = vi.fn(async ({ input }: { input: string[] }) => {
      const vectors = callVectors[callIndex] ?? input.map(() => ORTHOGONAL);
      callIndex += 1;
      return { vectors, dimension: 3 };
    });
    vi.mocked(resolveEmbeddingTarget).mockReturnValue({
      provider: { embed } as unknown as ResolvedEmbeddingTarget['provider'],
      model: { modelId: 'emb' } as unknown as ResolvedEmbeddingTarget['model'],
    });
    return embed;
  }

  function mockNoEmbedding() {
    vi.mocked(resolveEmbeddingTarget).mockReturnValue(null);
  }

  it('未配置嵌入模型：记忆正常落库但不建虚表，召回为空', async () => {
    mockNoEmbedding();
    const memory = createMemoryService({ db, cipher });
    const result = await memory.rememberCandidates([fact('用户喜欢猫'), fact('用户在上海')]);
    expect(result.created).toBe(2);
    expect(getMemoryVectorDimension(db)).toBeNull();
    expect(memory.list()).toHaveLength(2);
    expect(await memory.recall('喜欢什么宠物')).toEqual([]);
  });

  it('近似记忆去重合并：更新内容与重要性取大值，不新增行', async () => {
    mockEmbeddingByCall([[A], [NEAR_A]]);
    const memory = createMemoryService({ db, cipher });
    const first = await memory.rememberCandidates([fact('用户偏好简短回答', 0.5)]);
    const second = await memory.rememberCandidates([fact('用户偏好极简回答', 0.9)]);
    expect(first.created).toBe(1);
    expect(second.updated).toBe(1);
    expect(second.created).toBe(0);
    expect(memory.list()).toHaveLength(1);
    const stored = memory.list()[0]!;
    expect(stored.content).toBe('用户偏好极简回答');
    expect(stored.importance).toBe(0.9);
  });

  it('低相似记忆新建：正交向量产生两条', async () => {
    mockEmbeddingByCall([[A], [ORTHOGONAL]]);
    const memory = createMemoryService({ db, cipher });
    await memory.rememberCandidates([fact('用户在备考 PMP')]);
    const result = await memory.rememberCandidates([fact('用户养了一只橘猫')]);
    expect(result.created).toBe(1);
    expect(memory.list()).toHaveLength(2);
  });

  it('召回：阈值内命中并刷新访问时间，阈值外过滤', async () => {
    mockEmbeddingByCall([[A], [NEAR_A], [ORTHOGONAL]]);
    const memory = createMemoryService({ db, cipher });
    await memory.rememberCandidates([fact('用户偏好中文回复', 0.8)]);

    const hit = await memory.recall('该用什么语言');
    expect(hit).toHaveLength(1);
    expect(hit[0]!.content).toBe('用户偏好中文回复');
    expect(memory.get(hit[0]!.id)!.lastAccessedAt).toBeTruthy();

    const miss = await memory.recall('完全无关的问题');
    expect(miss).toEqual([]);
  });

  it('手工新建后可召回；删除时同步清理向量', async () => {
    mockEmbeddingByCall([[A], [NEAR_A]]);
    const memory = createMemoryService({ db, cipher });
    const created = await memory.createManual({
      kind: 'preference',
      content: '用户住在杭州',
      importance: 0.6,
    });
    expect(created.sourceConversationId).toBeNull();
    expect((await memory.recall('住在哪里'))[0]!.id).toBe(created.id);

    expect(memory.remove(created.id)).toBe(true);
    expect(memory.get(created.id)).toBeNull();
    expect(searchMemoryVectors(db, { vector: NEAR_A, k: 3 })).toEqual([]);
  });

  it('编辑内容会重新嵌入；clearAll 同时清空主表与虚表', async () => {
    const embed = mockEmbeddingByCall([[A], [NEAR_A]]);
    const memory = createMemoryService({ db, cipher });
    const created = await memory.createManual({ kind: 'fact', content: '旧内容', importance: 0.5 });
    await memory.update(created.id, { content: '新内容' });
    expect(embed).toHaveBeenCalledTimes(2);

    const removed = memory.clearAll();
    expect(removed).toBe(1);
    expect(memory.list()).toEqual([]);
    // 虚表已空：检索不报错且无结果
    expect(searchMemoryVectors(db, { vector: A, k: 3 })).toEqual([]);
  });

  it('归档记忆不参与语义召回', async () => {
    mockEmbeddingByCall([[A], [NEAR_A]]);
    const memory = createMemoryService({ db, cipher });
    const created = await memory.createManual({ kind: 'event', content: '去年参加过展会', importance: 0.4 });
    memory.update(created.id, { status: 'archived' });
    expect(await memory.recall('展会')).toEqual([]);
    expect(memory.list({ status: 'archived' })).toHaveLength(1);
  });
});
