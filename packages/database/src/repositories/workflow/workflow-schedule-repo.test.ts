import { describe, expect, it } from 'vitest';
import { createDatabase } from '../../client';
import { createWorkflowRepository } from './workflow-repo';
import { createWorkflowScheduleRepository } from './workflow-schedule-repo';

function setup() {
  const db = createDatabase(':memory:');
  const workflows = createWorkflowRepository(db);
  const wf = workflows.createWorkflow({ name: '定时' });
  return { db, wf, repo: createWorkflowScheduleRepository(db) };
}

describe('workflow schedule 仓储', () => {
  it('创建、读取与更新（同一流程保持一行）', () => {
    const { wf, repo } = setup();
    const created = repo.upsert({
      workflowId: wf.id,
      cron: '0 9 * * *',
      enabled: true,
      input: { topic: '周报' },
      nextRunAt: '2026-11-23T01:00:00.000Z',
    });
    expect(repo.getByWorkflow(wf.id)).toMatchObject({
      id: created.id,
      cron: '0 9 * * *',
      enabled: true,
      input: { topic: '周报' },
      lastStatus: null,
    });

    const updated = repo.upsert({
      workflowId: wf.id,
      cron: '30 8 * * 1',
      enabled: false,
      input: null,
      nextRunAt: '2026-11-24T00:30:00.000Z',
    });
    expect(updated.id).toBe(created.id);
    expect(updated).toMatchObject({ cron: '30 8 * * 1', enabled: false, input: null });
    expect(repo.getByWorkflow('missing')).toBeNull();
  });

  it('到期查询只返回启用且到点的调度', () => {
    const { db, wf, repo } = setup();
    const other = createWorkflowRepository(db).createWorkflow({ name: '另一个' });
    repo.upsert({ workflowId: wf.id, cron: '* * * * *', enabled: true, nextRunAt: '2026-11-23T01:00:00.000Z' });
    repo.upsert({
      workflowId: other.id,
      cron: '* * * * *',
      enabled: false,
      nextRunAt: '2026-11-23T01:00:00.000Z',
    });
    const due = repo.listDue('2026-11-23T02:00:00.000Z');
    expect(due).toHaveLength(1);
    expect(due[0]?.workflowId).toBe(wf.id);
  });

  it('原子认领：只有旧时间匹配才推进', () => {
    const { wf, repo } = setup();
    const view = repo.upsert({
      workflowId: wf.id,
      cron: '* * * * *',
      enabled: true,
      nextRunAt: '2026-11-23T01:00:00.000Z',
    });
    expect(repo.claimDue(view.id, '2026-11-23T01:00:00.000Z', '2026-11-23T01:01:00.000Z')).toBe(true);
    expect(repo.getByWorkflow(wf.id)?.nextRunAt).toBe('2026-11-23T01:01:00.000Z');
    expect(repo.claimDue(view.id, '2026-11-23T01:00:00.000Z', '2026-11-23T01:02:00.000Z')).toBe(false);
  });

  it('禁用后不能被认领', () => {
    const { wf, repo } = setup();
    const view = repo.upsert({
      workflowId: wf.id,
      cron: '* * * * *',
      enabled: false,
      nextRunAt: '2026-11-23T01:00:00.000Z',
    });
    expect(repo.claimDue(view.id, view.nextRunAt, '2026-11-23T02:00:00.000Z')).toBe(false);
  });

  it('记录结果与删除', () => {
    const { wf, repo } = setup();
    const view = repo.upsert({
      workflowId: wf.id,
      cron: '* * * * *',
      enabled: true,
      nextRunAt: '2026-11-23T01:00:00.000Z',
    });
    repo.recordOutcome(view.id, {
      lastRunAt: '2026-11-23T01:00:00.000Z',
      lastRunId: 'run-1',
      lastStatus: 'created',
    });
    expect(repo.getByWorkflow(wf.id)).toMatchObject({
      lastRunAt: '2026-11-23T01:00:00.000Z',
      lastRunId: 'run-1',
      lastStatus: 'created',
    });
    expect(repo.removeByWorkflow(wf.id)).toBe(true);
    expect(repo.getByWorkflow(wf.id)).toBeNull();
    expect(repo.removeByWorkflow(wf.id)).toBe(false);
  });
});
