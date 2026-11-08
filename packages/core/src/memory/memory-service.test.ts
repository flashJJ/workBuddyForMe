import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { createWebCipher, type SecretCipher } from '../secrets/cipher';
import { getMemoryVectorDimension, searchMemoryVectors } from '@wbfm/database';
import { createMemoryService } from './memory-service';
import { writeRealtimeConstraints } from './turn-memory';
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

  it('未配置嵌入模型：记忆正常落库；召回退化为关键词通道', async () => {
    mockNoEmbedding();
    const memory = createMemoryService({ db, cipher });
    const result = await memory.rememberCandidates([fact('用户喜欢猫'), fact('用户在上海')]);
    expect(result.created).toBe(2);
    expect(getMemoryVectorDimension(db)).toBeNull();
    expect(memory.list()).toHaveLength(2);
    const recalled = await memory.recall('喜欢什么宠物');
    expect(recalled.map((m) => m.content)).toContain('用户喜欢猫');
    expect(recalled[0]!.reason).toBe('keyword');
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
    expect(['semantic', 'hybrid']).toContain(hit[0]!.reason);
    expect(hit[0]!.score).toBeGreaterThan(0.9);
    expect(memory.get(hit[0]!.id)!.lastAccessedAt).toBeTruthy();
    expect(memory.get(hit[0]!.id)!.recallCount).toBe(1);

    const miss = await memory.recall('完全无关的问题');
    expect(miss).toEqual([]);
  });

  it('v2.6 溯源：记录来源会话语义与消息，召回计数随命中递增', async () => {
    mockEmbeddingByCall([[A], [NEAR_A], [NEAR_A]]);
    const memory = createMemoryService({ db, cipher });
    await memory.rememberCandidates([fact('用户偏好中文回复', 0.8)], {
      sourceConversationId: 'c1',
      sourceMessageId: 'msg-9',
    });
    const stored = memory.list()[0]!;
    expect(stored).toMatchObject({
      sourceConversationId: 'c1',
      sourceMessageId: 'msg-9',
      recallCount: 0,
    });

    await memory.recall('该用什么语言');
    await memory.recall('中文怎么回复');
    expect(memory.get(stored.id)!.recallCount).toBe(2);
    expect(memory.get(stored.id)!.sourceMessageId).toBe('msg-9');
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
    expect(created.sourceMessageId).toBeNull();
    expect(created.recallCount).toBe(0);
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

  it('P1-1 rememberOne：情景记忆走同一套去重管线，内容截断 500 字', async () => {
    mockEmbeddingByCall([[A], [NEAR_A]]);
    const memory = createMemoryService({ db, cipher });
    const saved = await memory.rememberOne({
      kind: 'event',
      content: '早期对话摘要：讨论了搬家计划',
      importance: 0.6,
      sourceConversationId: 'c1',
    });
    expect(saved.kind).toBe('event');
    expect(saved.sourceConversationId).toBe('c1');
    // 近似的下一次摘要合并而非新建
    const merged = await memory.rememberOne({
      kind: 'event',
      content: '早期对话摘要：讨论了搬家计划与时间安排',
      importance: 0.6,
      sourceConversationId: 'c1',
    });
    expect(merged.id).toBe(saved.id);
    expect(memory.list()).toHaveLength(1);
  });

  it('v2.26 同主体冲突：旧记忆 superseded，新版本 version=2 并写审计', async () => {
    mockEmbeddingByCall([[A], [ORTHOGONAL]]);
    const memory = createMemoryService({ db, cipher });
    const first = await memory.rememberCandidates([
      { kind: 'fact', content: '用户住在北京', importance: 0.7, subjectKey: 'residence:city' },
    ]);
    const second = await memory.rememberCandidates([
      { kind: 'fact', content: '用户住在上海', importance: 0.7, subjectKey: 'residence:city' },
    ]);
    expect(first.created).toBe(1);
    expect(second.superseded).toBe(1);

    const active = memory.list({ status: 'active' });
    expect(active).toHaveLength(1);
    expect(active[0]!.content).toBe('用户住在上海');
    expect(active[0]!.version).toBe(2);
    const old = memory.list({ status: 'superseded' });
    expect(old).toHaveLength(1);
    expect(old[0]!.supersededBy).toBe(active[0]!.id);
    const audit = db.prepare(`SELECT COUNT(*) AS n FROM memory_events`).get() as { n: number };
    expect(audit.n).toBe(3);
  });

  it('v2.26 置顶约束：无关问题也会注入，分数不低于 0.9', async () => {
    mockNoEmbedding();
    const memory = createMemoryService({ db, cipher });
    await memory.rememberCandidates(
      [
        {
          kind: 'constraint',
          content: '用户对花生过敏',
          importance: 0.95,
          pinned: true,
          subjectKey: 'allergy:花生',
        },
      ],
      { scope: 'assistant', assistantId: 'a1', source: 'realtime' },
    );
    const hit = await memory.recall('今天天气怎么样', { assistantId: 'a1' });
    expect(hit.map((m) => m.content)).toContain('用户对花生过敏');
    expect(hit[0]!.reason).toBe('pinned');
    expect(hit[0]!.score).toBeGreaterThanOrEqual(0.9);
  });

  it('v2.26 作用域隔离：助手记忆互不可见，全局记忆仍可见', async () => {
    mockNoEmbedding();
    const memory = createMemoryService({ db, cipher });
    await memory.rememberCandidates([fact('用户喜欢猫')], {
      scope: 'assistant',
      assistantId: 'a1',
    });
    await memory.createManual({ kind: 'fact', content: '用户叫小林', importance: 0.9 });

    const other = await memory.recall('喜欢猫', { assistantId: 'a2' });
    expect(other.map((m) => m.content)).not.toContain('用户喜欢猫');
    const own = await memory.recall('喜欢猫', { assistantId: 'a1' });
    expect(own.map((m) => m.content)).toContain('用户喜欢猫');
    const global = await memory.recall('小林', { assistantId: 'a2' });
    expect(global.map((m) => m.content)).toContain('用户叫小林');
  });

  it('P2 runDecay：decay_score 分档归档，30 天内保留，usage 提升抗衰', () => {
    mockNoEmbedding();
    const memory = createMemoryService({ db, cipher });
    db.prepare(`INSERT INTO memories(kind, content, importance, status, created_at, updated_at, recall_count)
                VALUES ('fact','陈旧琐事',0.2,'active','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z',0),
                       ('preference','长期偏好',0.9,'active','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z',0),
                       ('fact','常被召回',0.5,'active','2025-12-01T00:00:00.000Z','2025-12-01T00:00:00.000Z',3),
                       ('fact','新鲜琐事',0.1,'active','2026-03-10T00:00:00.000Z','2026-03-10T00:00:00.000Z',0)`).run();

    const now = new Date('2026-03-20T00:00:00.000Z');
    const result = memory.runDecay({ now });
    expect(result).toMatchObject({ archived: 1, skipped: false });
    expect(memory.list({ status: 'archived' }).map((m) => m.content)).toEqual(['陈旧琐事']);
    expect(memory.runDecay({ now }).skipped).toBe(true);
    expect(memory.runDecay({ now, force: true }).archived).toBe(0);
  });

  it('v2.28 writeRealtimeConstraints：done 前写入并返回最多 2 条提示', async () => {
    const embed = mockEmbeddingByCall([[A]]);
    const memory = createMemoryService({ db, cipher });
    const notices = await writeRealtimeConstraints({
      memory,
      userContent: '我对花生过敏。我不能吃海鲜。以后不要熬夜。',
      conversationId: 'c1',
      assistantId: 'a1',
      sourceMessageId: 'm1',
    });
    expect(notices).toHaveLength(2);
    expect(notices[0]?.content).toContain('花生');
    expect(memory.list({ status: 'active' })).toHaveLength(3);
    // 实时约束为纯规则写入，不调用嵌入模型
    expect(embed).not.toHaveBeenCalled();
  });

  it('v2.28 writeRealtimeConstraints：无硬约束时返回空且不写库', async () => {
    mockNoEmbedding();
    const memory = createMemoryService({ db, cipher });
    const notices = await writeRealtimeConstraints({
      memory, userContent: '今天天气不错', conversationId: 'c1', assistantId: 'a1', sourceMessageId: 'm1',
    });
    expect(notices).toEqual([]);
    expect(memory.list({ status: 'active' })).toHaveLength(0);
  });
});
