import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { createWebCipher, type SecretCipher } from '../secrets/cipher';
import { createMemoryService } from './memory-service';
import type { ExtractedMemory } from './extractor';
import { resolveEmbeddingTarget } from '../ingestion/embedding-target';

vi.mock('../ingestion/embedding-target', () => ({
  resolveEmbeddingTarget: vi.fn(),
}));

/** v2.26 P2 golden 评测：冲突/陈旧/负样本/作用域隔离 + 无嵌入召回率。 */

const DIM = 16;

interface Scenario {
  content: string;
  query: string;
  expected: string;
}

const POSITIVES: Scenario[] = [
  { content: '用户名叫李明，朋友叫他阿明', query: '我叫什么名字？', expected: '李明' },
  { content: '用户正在准备 PMP 考试', query: '我最近在准备什么考试？', expected: 'PMP' },
  { content: '用户在杭州做后端工程师', query: '我在杭州做什么工作？', expected: '杭州' },
  { content: '用户偏好简体中文回复', query: '我希望你用什么语言回复我？', expected: '简体中文' },
  { content: '用户养了一只橘猫叫橙子', query: '我养的猫叫什么名字？', expected: '橙子' },
  { content: '用户不吃香菜，忌口是香菜', query: '我有什么忌口？', expected: '香菜' },
  { content: '用户下周六搬家到西湖区', query: '我什么时候搬家？', expected: '搬家' },
  { content: '用户的副业项目是 WorkBuddy', query: '我的副业项目叫什么？', expected: 'WorkBuddy' },
];

function axis(index: number): number[] {
  const vector = Array<number>(DIM).fill(0);
  vector[index] = 1;
  return vector;
}

function mockVectors(map: Record<string, number[]>): void {
  const embed = vi.fn(async ({ input }: { input: string[] }) => ({
    vectors: input.map((text) => map[text] ?? axis(DIM - 1)),
    dimension: DIM,
  }));
  vi.mocked(resolveEmbeddingTarget).mockReturnValue({
    provider: { embed } as never,
    model: { modelId: 'emb' } as never,
  });
}

function mockNoEmbedding(): void {
  vi.mocked(resolveEmbeddingTarget).mockReturnValue(null);
}

function toCandidate(scenario: Scenario): ExtractedMemory {
  return { kind: 'fact', content: scenario.content, importance: 0.8 };
}

describe('P2 生命周期与评测', () => {
  let db: DatabaseInstance;
  let cipher: SecretCipher;

  beforeEach(() => {
    db = createDatabase(':memory:');
    cipher = createWebCipher();
    vi.clearAllMocks();
  });

  it('golden 正样本 hit@3 与负样本误召回率', async () => {
    const map: Record<string, number[]> = {};
    POSITIVES.forEach((item, index) => {
      map[item.content] = axis(index);
      map[item.query] = axis(index);
    });
    map.zzzz = axis(DIM - 1);
    map.qqqq = axis(DIM - 1);
    mockVectors(map);
    const memory = createMemoryService({ db, cipher });
    await memory.rememberCandidates(POSITIVES.map(toCandidate));

    let hits = 0;
    for (const item of POSITIVES) {
      const recalled = await memory.recall(item.query);
      if (recalled.slice(0, 3).some((m) => m.content.includes(item.expected))) hits += 1;
    }
    const negatives = ['zzzz', 'qqqq'];
    let falseRecalls = 0;
    for (const query of negatives) {
      if ((await memory.recall(query)).length > 0) falseRecalls += 1;
    }
    expect(hits / POSITIVES.length).toBeGreaterThanOrEqual(0.8);
    expect(falseRecalls / negatives.length).toBeLessThanOrEqual(0.1);
  });

  it('golden 无嵌入召回率：纯关键词通道 hit@3', async () => {
    mockNoEmbedding();
    const memory = createMemoryService({ db, cipher });
    await memory.rememberCandidates(POSITIVES.map(toCandidate));
    let hits = 0;
    for (const item of POSITIVES) {
      const recalled = await memory.recall(item.query);
      if (recalled.slice(0, 3).some((m) => m.content.includes(item.expected))) hits += 1;
    }
    expect(hits / POSITIVES.length).toBeGreaterThanOrEqual(0.75);
  });

  it('golden 冲突：同主体新版本取代旧版本，冲突解决正确率 100%', async () => {
    mockVectors({
      用户住在北京: axis(0),
      用户住在上海: axis(0),
      '我现在住在哪个城市？': axis(0),
    });
    const memory = createMemoryService({ db, cipher });
    await memory.rememberCandidates([
      { kind: 'fact', content: '用户住在北京', importance: 0.7, subjectKey: 'residence:city' },
    ]);
    await memory.rememberCandidates([
      { kind: 'fact', content: '用户住在上海', importance: 0.7, subjectKey: 'residence:city' },
    ]);
    const recalled = await memory.recall('我现在住在哪个城市？');
    const solved =
      recalled.some((m) => m.content === '用户住在上海') &&
      !recalled.some((m) => m.content === '用户住在北京');
    expect(solved).toBe(true);
    expect(memory.list({ status: 'active' })).toHaveLength(1);
  });

  it('golden 陈旧：衰减后旧事件不再干扰召回，陈旧干扰率为 0', async () => {
    mockVectors({
      用户计划下周六搬家: axis(0),
      '用户已经搬到西湖区新家': axis(1),
      '我搬家的事怎么样了？': axis(1),
    });
    const memory = createMemoryService({ db, cipher });
    const stale = await memory.rememberCandidates([
      { kind: 'event', content: '用户计划下周六搬家', importance: 0.2 },
    ]);
    await memory.rememberCandidates([
      { kind: 'fact', content: '用户已经搬到西湖区新家', importance: 0.8 },
    ]);
    db.prepare(`UPDATE memories SET created_at = ?, updated_at = ? WHERE id = ?`).run(
      '2025-01-01T00:00:00.000Z',
      '2025-01-01T00:00:00.000Z',
      Number(stale.memories[0]!.id),
    );
    memory.runDecay({ now: new Date(), force: true });

    const recalled = await memory.recall('我搬家的事怎么样了？');
    expect(memory.get(stale.memories[0]!.id)!.status).toBe('archived');
    expect(recalled.some((m) => m.content === '用户计划下周六搬家')).toBe(false);
    expect(recalled.some((m) => m.content === '用户已经搬到西湖区新家')).toBe(true);
  });

  it('golden 作用域隔离：助手 A 的记忆不出现在助手 B 的召回', async () => {
    mockVectors({ 用户喜欢猫: axis(0), '我喜欢什么宠物？': axis(0) });
    const memory = createMemoryService({ db, cipher });
    await memory.rememberCandidates([{ kind: 'fact', content: '用户喜欢猫', importance: 0.8 }], {
      scope: 'assistant',
      assistantId: 'a1',
    });
    const own = await memory.recall('我喜欢什么宠物？', { assistantId: 'a1' });
    const other = await memory.recall('我喜欢什么宠物？', { assistantId: 'a2' });
    expect(own.some((m) => m.content === '用户喜欢猫')).toBe(true);
    expect(other.some((m) => m.content === '用户喜欢猫')).toBe(false);
  });

  it('P2 TTL：临时事件到期由 runDecay 归档', async () => {
    mockNoEmbedding();
    const memory = createMemoryService({ db, cipher });
    const saved = await memory.rememberOne({
      kind: 'event',
      content: '临时任务状态',
      importance: 0.5,
      ttlAt: '2026-03-01T00:00:00.000Z',
    });
    expect(memory.get(saved.id)!.ttlAt).toBe('2026-03-01T00:00:00.000Z');
    expect(memory.runDecay({ now: new Date('2026-03-20T00:00:00.000Z') }).expired).toBe(1);
    expect(memory.get(saved.id)!.status).toBe('archived');
  });

  it('P2 线上计数：零召回率、superseded 比例与用户纠正次数', async () => {
    mockNoEmbedding();
    const memory = createMemoryService({ db, cipher });
    await memory.rememberCandidates([
      { kind: 'fact', content: '用户住在北京', importance: 0.7, subjectKey: 'residence:city' },
    ]);
    await memory.rememberCandidates([
      { kind: 'fact', content: '用户住在上海', importance: 0.7, subjectKey: 'residence:city' },
    ]);
    await memory.recall('住在上海');
    await memory.recall('zzzz');
    expect(memory.getStats()).toMatchObject({
      total: 2,
      superseded: 1,
      supersededRatio: 0.5,
      recallTotal: 2,
      zeroRecallRate: 0.5,
    });

    const active = memory.list({ status: 'active' })[0]!;
    await memory.update(active.id, { content: '用户搬到上海' });
    memory.remove(active.id);
    expect(memory.getStats().userCorrections).toBe(2);
  });
});
