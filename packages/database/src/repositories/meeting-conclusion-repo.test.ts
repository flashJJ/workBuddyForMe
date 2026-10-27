import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { applyMigrations } from '../migrations/runner';
import { createMeetingConclusionRepository } from './meeting-conclusion-repo';

describe('meeting-conclusion-repo', () => {
  let db: Database.Database;
  let repo: ReturnType<typeof createMeetingConclusionRepository>;

  beforeEach(() => {
    db = new Database(':memory:');
    applyMigrations(db);
    db.prepare(
      `INSERT INTO meetings(id,topic,member_ids,created_at) VALUES('m1','评审',?,'t')`,
    ).run(JSON.stringify(['a', 'b']));
    repo = createMeetingConclusionRepository(db);
  });

  const draftItems = [
    {
      content: '补充测试',
      ownerLabel: '阿策',
      ownerMemberId: 'a',
      dueAt: '2026-11-01T09:00:00+08:00',
    },
  ];

  it('生成保存：结论与行动项同事务落库，重复生成替换 generated、保留 manual', () => {
    repo.saveGeneratedConclusion(
      {
        meetingId: 'm1',
        summary: '采用方案 A',
        decisions: ['上线 A'],
        openQuestions: [],
        modelId: 'mock-model',
      },
      draftItems,
    );
    const manual = repo.createActionItem('m1', {
      content: '人工补充',
      ownerLabel: '用户',
      ownerMemberId: null,
      dueAt: null,
    });

    expect(repo.getConclusion('m1')).toMatchObject({
      summary: '采用方案 A',
      decisions: ['上线 A'],
      modelId: 'mock-model',
    });
    expect(repo.listActionItems('m1')).toHaveLength(2);

    repo.saveGeneratedConclusion(
      {
        meetingId: 'm1',
        summary: '改为方案 B',
        decisions: [],
        openQuestions: ['待评估'],
        modelId: 'mock-model',
      },
      [{ ...draftItems[0]!, content: '重新测试' }],
    );

    const items = repo.listActionItems('m1');
    expect(items.map((x) => x.source).sort()).toEqual(['generated', 'manual']);
    expect(items.find((x) => x.source === 'manual')?.id).toBe(manual.id);
    expect(items.find((x) => x.source === 'generated')?.content).toBe('重新测试');
    expect(repo.getConclusion('m1')?.summary).toBe('改为方案 B');
  });

  it('编辑结论：只更新传入字段并写 edited_at', () => {
    repo.saveGeneratedConclusion(
      {
        meetingId: 'm1',
        summary: '原结论',
        decisions: ['决策 1'],
        openQuestions: ['问题 1'],
        modelId: null,
      },
      [],
    );
    const updated = repo.updateConclusion('m1', { summary: '新结论' });
    expect(updated).toMatchObject({ summary: '新结论', decisions: ['决策 1'] });
    expect(updated?.editedAt).not.toBeNull();
    expect(repo.updateConclusion('missing', { summary: 'x' })).toBeNull();
  });

  it('行动项：状态/负责人可更新，清空 nullable 字段生效', () => {
    const item = repo.createActionItem('m1', {
      content: '行动项',
      ownerLabel: '阿策',
      ownerMemberId: 'a',
      dueAt: '2026-11-01T09:00:00+08:00',
    });
    const done = repo.updateActionItem('m1', item.id, { status: 'done' });
    expect(done?.status).toBe('done');
    const cleared = repo.updateActionItem('m1', item.id, {
      ownerMemberId: null,
      ownerLabel: '',
      dueAt: null,
    });
    expect(cleared).toMatchObject({ ownerMemberId: null, ownerLabel: '', dueAt: null });
    expect(repo.updateActionItem('m1', 'missing', { status: 'done' })).toBeNull();
  });

  it('行动项：提醒/Flow 运行回链只写对应列', () => {
    const item = repo.createActionItem('m1', {
      content: '闭环',
      ownerLabel: '',
      ownerMemberId: null,
      dueAt: null,
    });
    expect(repo.linkReminder('m1', item.id, 'r1')?.linkedReminderId).toBe('r1');
    const linked = repo.linkFlowRun('m1', item.id, 'run1');
    expect(linked).toMatchObject({ linkedReminderId: 'r1', linkedFlowRunId: 'run1' });
    expect(repo.linkReminder('m1', 'missing', 'r2')).toBeNull();
  });
});
