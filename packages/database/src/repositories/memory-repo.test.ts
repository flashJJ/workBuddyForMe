import { describe, expect, it, beforeEach } from 'vitest';
import {
  createDatabase,
  createMemoryRepository,
  ensureMemoryVectorTable,
  upsertMemoryVector,
  deleteMemoryVector,
  searchMemoryVectors,
  getMemoryVectorDimension,
  type DatabaseInstance,
} from '../index';

/**
 * 3 维单位向量：a 与 b 同向（距离 0），a 与 c 正交（距离 ≈√2=1.414）。
 * 用于验证去重阈值（0.35）与召回阈值（0.78）的 SQL 行为。
 */
const V_A = [1, 0, 0];
/** 与 a 小夹角（cos≈0.99，L2≈0.14） */
const V_B = [0.99, 0.14, 0];
const V_C = [0, 1, 0];

describe('memory 仓储与 memories_vec 向量管线', () => {
  let db: DatabaseInstance;

  beforeEach(() => {
    db = createDatabase(':memory:');
  });

  it('记忆 CRUD：新增自增整型 id（对外字符串）、列表排序、更新与访问时间', () => {
    const repo = createMemoryRepository(db);
    const m1 = repo.add({ kind: 'fact', content: '在准备 PMP 考试', importance: 0.7 });
    const m2 = repo.add({
      kind: 'preference',
      content: '偏好中文回复',
      importance: 0.9,
      sourceConversationId: 'c1',
    });
    expect(m1.id).toBe('1');
    expect(m2.id).toBe('2');
    expect(m1.sourceConversationId).toBeNull();
    expect(m2.status).toBe('active');

    // 重要性高的排前面
    expect(repo.list().map((m) => m.id)).toEqual(['2', '1']);
    // 搜索与类别过滤
    expect(repo.list({ search: 'pmp' })).toHaveLength(1);
    expect(repo.list({ kind: 'preference' })[0]!.content).toBe('偏好中文回复');

    repo.touchAccessed(['2']);
    expect(repo.findById('2')!.lastAccessedAt).toBeTruthy();

    const updated = repo.update('1', { content: '已通过 PMP 考试', status: 'archived' })!;
    expect(updated.content).toBe('已通过 PMP 考试');
    expect(updated.status).toBe('archived');
    expect(repo.list({ status: 'active' })).toHaveLength(1);
    expect(repo.count()).toBe(2);
    expect(repo.delete('1')).toBe(true);
    expect(repo.findById('1')).toBeNull();
  });

  it('向量写入与检索：同向记忆距离 0 命中，正交记忆被阈值过滤，归档不参与召回', () => {
    const repo = createMemoryRepository(db);
    ensureMemoryVectorTable(db, 3);
    expect(getMemoryVectorDimension(db)).toBe(3);

    const near = repo.add({ kind: 'fact', content: '近似记忆', importance: 0.5 });
    const orthogonal = repo.add({ kind: 'event', content: '正交记忆', importance: 0.5 });
    upsertMemoryVector(db, { id: Number(near.id), vector: V_A });
    upsertMemoryVector(db, { id: Number(orthogonal.id), vector: V_C });

    // 用与 a 小夹角的 b 方向查询
    const hits = searchMemoryVectors(db, { vector: V_B, k: 5 });
    expect(hits[0]!.memoryId).toBe(Number(near.id));
    expect(hits[0]!.distance).toBeLessThan(0.35);
    const farHit = hits.find((h) => h.memoryId === Number(orthogonal.id));
    expect(farHit?.distance).toBeGreaterThan(0.78);

    // 应用层阈值过滤：只留近似记忆
    const recalled = hits.filter((h) => h.distance <= 0.78);
    expect(recalled.map((h) => h.memoryId)).toEqual([Number(near.id)]);

    // 归档后即使距离近也不召回
    repo.update(near.id, { status: 'archived' });
    expect(searchMemoryVectors(db, { vector: V_B, k: 5 })).toHaveLength(1);

    deleteMemoryVector(db, Number(near.id));
    expect(searchMemoryVectors(db, { vector: V_B, k: 5 })).toHaveLength(1);
  });

  it('未建虚表时检索返回空数组（未配置嵌入模型的新库）', () => {
    expect(getMemoryVectorDimension(db)).toBeNull();
    expect(searchMemoryVectors(db, { vector: V_A, k: 3 })).toEqual([]);
  });

  it('维度冲突直接拒绝', () => {
    ensureMemoryVectorTable(db, 3);
    expect(() => ensureMemoryVectorTable(db, 8)).toThrow(/维度冲突/);
  });

  it('P1-1 时间线过滤：from/to（含当日）按 created_at 筛选', () => {
    const repo = createMemoryRepository(db);
    repo.add({ kind: 'fact', content: '旧记忆', importance: 0.5 });
    db.prepare(`UPDATE memories SET created_at = ?, updated_at = ? WHERE id = 1`).run(
      '2026-01-10T08:00:00.000Z',
      '2026-01-10T08:00:00.000Z',
    );
    repo.add({ kind: 'fact', content: '新记忆', importance: 0.5 });
    db.prepare(`UPDATE memories SET created_at = ?, updated_at = ? WHERE id = 2`).run(
      '2026-03-20T08:00:00.000Z',
      '2026-03-20T08:00:00.000Z',
    );

    expect(repo.list({ createdAfter: '2026-03-01' }).map((m) => m.content)).toEqual(['新记忆']);
    expect(repo.list({ createdBefore: '2026-01-10' }).map((m) => m.content)).toEqual(['旧记忆']);
    expect(
      repo
        .list({ createdAfter: '2026-01-01', createdBefore: '2026-02-01' })
        .map((m) => m.content),
    ).toEqual(['旧记忆']);
  });

  it('P1-1 衰减归档：旧+低重要性+未访问的 active 记忆被归档，高重要性/新/已访问的保留', () => {
    const repo = createMemoryRepository(db);
    const staleLow = repo.add({ kind: 'fact', content: '陈旧琐事', importance: 0.2 });
    const staleHigh = repo.add({ kind: 'preference', content: '长期重要偏好', importance: 0.9 });
    const recentLow = repo.add({ kind: 'fact', content: '新鲜琐事', importance: 0.1 });
    const accessedLow = repo.add({ kind: 'event', content: '旧但常被召回', importance: 0.2 });
    const oldTime = '2026-01-01T00:00:00.000Z';
    db.prepare(
      `UPDATE memories SET created_at = @ts, updated_at = @ts WHERE id IN (1, 2, 4)`,
    ).run({ ts: oldTime });
    // id=4 近期被访问过
    db.prepare(`UPDATE memories SET last_accessed_at = ? WHERE id = 4`).run(
      '2026-03-25T00:00:00.000Z',
    );

    const archived = repo.archiveStale({
      createdBefore: '2026-03-01T00:00:00.000Z',
      accessedBefore: '2026-03-01T00:00:00.000Z',
      maxImportance: 0.4,
    });
    expect(archived).toBe(1);
    expect(repo.findById(staleLow.id)!.status).toBe('archived');
    expect(repo.findById(staleHigh.id)!.status).toBe('active');
    expect(repo.findById(recentLow.id)!.status).toBe('active');
    expect(repo.findById(accessedLow.id)!.status).toBe('active');
    // 再跑一次不重复归档
    expect(
      repo.archiveStale({
        createdBefore: '2026-03-01T00:00:00.000Z',
        accessedBefore: '2026-03-01T00:00:00.000Z',
        maxImportance: 0.4,
      }),
    ).toBe(0);
  });
});
