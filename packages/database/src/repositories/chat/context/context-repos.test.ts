import { beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseInstance } from '../../../client';
import { createConversationFactRepository } from './conversation-fact-repo';
import { createTaskCheckpointRepository } from './task-checkpoint-repo';

describe('v2.26 P1 会话事实仓储', () => {
  let db: DatabaseInstance;
  beforeEach(() => {
    db = createDatabase(':memory:');
  });

  it('载荷落库：facts/decisions/open_loops 三类同表，重复写入计为未变化', () => {
    const repo = createConversationFactRepository(db);
    const payload = {
      summary: '摘要',
      facts: [{ key: 'budget', value: '5000', unit: '元', validFrom: '2026-03-01' }],
      decisions: ['采用方案 A'],
      openLoops: ['待确认上线时间'],
    };
    const first = repo.upsertPayload('c1', payload, ['m1', 'm2']);
    expect(first).toEqual({ inserted: 3, updated: 0, unchanged: 0 });

    const second = repo.upsertPayload('c1', payload, ['m3']);
    expect(second).toEqual({ inserted: 0, updated: 0, unchanged: 3 });

    const rows = repo.listByConversation('c1');
    expect(rows).toHaveLength(3);
    const fact = rows.find((row) => row.kind === 'fact')!;
    expect(fact).toMatchObject({
      conversationId: 'c1',
      key: 'budget',
      value: '5000',
      unit: '元',
      validFrom: '2026-03-01',
      sourceMessageIds: ['m1', 'm2'],
    });
    expect(rows.some((row) => row.kind === 'decision')).toBe(true);
    expect(rows.some((row) => row.kind === 'open_loop')).toBe(true);
  });

  it('同 key 值变化 → 更新且保留创建时间；不同会话互不影响', () => {
    const repo = createConversationFactRepository(db);
    repo.upsertPayload(
      'c1',
      { summary: 's', facts: [{ key: 'budget', value: '5000', unit: null, validFrom: null }], decisions: [], openLoops: [] },
      ['m1'],
    );
    const before = repo.listByConversation('c1')[0]!;
    const stats = repo.upsertPayload(
      'c1',
      { summary: 's', facts: [{ key: 'budget', value: '6000', unit: null, validFrom: null }], decisions: [], openLoops: [] },
      ['m2'],
    );
    expect(stats.updated).toBe(1);
    const after = repo.listByConversation('c1')[0]!;
    expect(after.value).toBe('6000');
    expect(after.createdAt).toBe(before.createdAt);

    repo.upsertPayload(
      'c2',
      { summary: 's', facts: [{ key: 'budget', value: '9000', unit: null, validFrom: null }], decisions: [], openLoops: [] },
      [],
    );
    expect(repo.listByConversation('c2')).toHaveLength(1);
  });
});

describe('v2.26 P1 任务检查点仓储', () => {
  let db: DatabaseInstance;
  beforeEach(() => {
    db = createDatabase(':memory:');
  });

  it('保存后可读取；再次保存覆盖同一行；完成后不再活跃', () => {
    const repo = createTaskCheckpointRepository(db);
    const saved = repo.save({
      conversationId: 'c1',
      goal: '发布 v2.26',
      plan: '分三步',
      todos: [{ title: '写迁移', status: 'done' }],
      lastToolSummary: 'pnpm test 通过',
      nextStep: '补单测',
      expiresAt: '2999-01-01T00:00:00.000Z',
    });
    expect(repo.findActive('c1')?.id).toBe(saved.id);

    const again = repo.save({
      conversationId: 'c1',
      goal: '发布 v2.26',
      plan: '分三步',
      todos: [{ title: '写迁移', status: 'done' }, { title: '补单测', status: 'running' }],
      lastToolSummary: 'pnpm check 通过',
      nextStep: '提交',
      expiresAt: '2999-01-01T00:00:00.000Z',
    });
    expect(again.id).toBe(saved.id);
    expect(again.todos).toHaveLength(2);
    expect(again.lastToolSummary).toBe('pnpm check 通过');

    expect(repo.finish('c1', 'done')).toBe(true);
    expect(repo.findActive('c1')).toBeNull();
  });

  it('过期检查点不再返回，并由 expireDue 归档', () => {
    const repo = createTaskCheckpointRepository(db);
    repo.save({
      conversationId: 'c1',
      goal: '目标',
      plan: null,
      todos: [],
      lastToolSummary: null,
      nextStep: null,
      expiresAt: '2000-01-01T00:00:00.000Z',
    });
    expect(repo.findActive('c1', '2026-01-01T00:00:00.000Z')).toBeNull();
    expect(repo.expireDue('2026-01-01T00:00:00.000Z')).toBe(1);
    const row = db.prepare(`SELECT status FROM task_checkpoints`).get() as { status: string };
    expect(row.status).toBe('expired');
  });
});
