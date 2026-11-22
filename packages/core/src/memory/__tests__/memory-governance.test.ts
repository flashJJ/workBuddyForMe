import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { createWebCipher, type SecretCipher } from '../../secrets/cipher';
import { createMemoryService } from '../memory-service';
import { MemoryGovernanceError } from '../lifecycle/ops/update';
import { resolveEmbeddingTarget } from '../../ingestion/embedding-target';

vi.mock('../../ingestion/embedding-target', () => ({
  resolveEmbeddingTarget: vi.fn(),
}));

describe('v4.21 记忆治理动作', () => {
  let db: DatabaseInstance;
  let cipher: SecretCipher;

  beforeEach(() => {
    db = createDatabase(':memory:');
    cipher = createWebCipher();
    vi.clearAllMocks();
    vi.mocked(resolveEmbeddingTarget).mockReturnValue(null);
  });

  function actions(memoryId: string): string[] {
    return (
      db
        .prepare(`SELECT action FROM memory_events WHERE memory_id = ? ORDER BY id ASC`)
        .all(Number(memoryId)) as Array<{ action: string }>
    ).map((row) => row.action);
  }

  it('固定/取消固定幂等：重复操作不写审计', async () => {
    const memory = createMemoryService({ db, cipher });
    const created = await memory.createManual({ kind: 'fact', content: '用户住在杭州', importance: 0.5 });

    await memory.update(created.id, { pinned: true });
    await memory.update(created.id, { pinned: true });
    expect(memory.get(created.id)!.pinned).toBe(true);
    expect(actions(created.id)).toEqual(['create', 'pin']);

    await memory.update(created.id, { pinned: false });
    expect(memory.get(created.id)!.pinned).toBe(false);
    expect(actions(created.id)).toEqual(['create', 'pin', 'unpin']);
  });

  it('升降权按 0.1 调整并写对应审计，重复到底部不再写', async () => {
    const memory = createMemoryService({ db, cipher });
    const created = await memory.createManual({ kind: 'fact', content: '用户喜欢猫', importance: 0.5 });

    await memory.update(created.id, { weight: 'down' });
    expect(memory.get(created.id)!.importance).toBeCloseTo(0.4);
    expect(actions(created.id)).toEqual(['create', 'downweight']);

    await memory.update(created.id, { weight: 'up' });
    expect(memory.get(created.id)!.importance).toBeCloseTo(0.5);
    expect(actions(created.id)).toEqual(['create', 'downweight', 'upweight']);

    await memory.update(created.id, { importance: 0 });
    await memory.update(created.id, { weight: 'down' });
    expect(memory.get(created.id)!.importance).toBe(0);
    expect(actions(created.id)).toEqual(['create', 'downweight', 'upweight', 'update']);
  });

  it('硬约束拒绝取消固定', async () => {
    const memory = createMemoryService({ db, cipher });
    const constraint = await memory.rememberOne({
      kind: 'constraint',
      content: '用户对花生过敏',
      importance: 0.9,
      pinned: true,
      subjectKey: 'allergy:peanut',
    });

    await expect(memory.update(constraint.id, { pinned: false })).rejects.toBeInstanceOf(
      MemoryGovernanceError,
    );
    expect(memory.get(constraint.id)!.pinned).toBe(true);
  });

  it('合并：来源归档、目标保留，重复合并不重复计数', async () => {
    const memory = createMemoryService({ db, cipher });
    const target = await memory.createManual({ kind: 'fact', content: '用户住在杭州', importance: 0.7 });
    const source = await memory.createManual({ kind: 'fact', content: '用户在杭州工作', importance: 0.6 });

    await memory.update(target.id, { mergeIds: [source.id] });
    expect(memory.get(source.id)!.status).toBe('archived');
    expect(memory.get(target.id)!.status).toBe('active');
    expect(actions(target.id)).toEqual(['create', 'merge']);
    expect(memory.getStats().mergedTotal).toBe(1);

    await memory.update(target.id, { mergeIds: [source.id] });
    expect(actions(target.id)).toEqual(['create', 'merge']);
    expect(memory.getStats().mergedTotal).toBe(1);
  });

  it('固定后召回置顶，取消固定回落，降权后分数下降', async () => {
    const memory = createMemoryService({ db, cipher });
    const common = await memory.createManual({
      kind: 'fact',
      content: '用户喜欢猫',
      importance: 0.8,
    });
    const pinTarget = await memory.createManual({
      kind: 'fact',
      content: '用户喜欢狗',
      importance: 0.2,
    });
    const baseScore = (await memory.recall({ query: '喜欢' })).find(
      (item) => item.id === common.id,
    )!.score;

    await memory.update(pinTarget.id, { pinned: true });
    const afterPin = await memory.recall({ query: '喜欢' });
    expect(afterPin[0]).toMatchObject({ id: pinTarget.id, reason: 'pinned' });

    await memory.update(pinTarget.id, { pinned: false });
    const unpinned = (await memory.recall({ query: '喜欢' })).find(
      (item) => item.id === pinTarget.id,
    );
    expect(unpinned?.reason).not.toBe('pinned');

    await memory.update(common.id, { weight: 'down' });
    const afterDown = (await memory.recall({ query: '喜欢' })).find(
      (item) => item.id === common.id,
    );
    expect(afterDown!.score).toBeLessThan(baseScore);
  });
});
