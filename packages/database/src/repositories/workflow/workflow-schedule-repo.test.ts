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

const base = {
  name: '',
  timezone: 'Asia/Shanghai',
  enabled: true,
};

describe('workflow schedule 仓储（v4.26 多定时）', () => {
  it('同一流程可创建多条，列表按创建顺序', () => {
    const { wf, repo } = setup();
    const first = repo.create({
      ...base,
      workflowId: wf.id,
      name: '早间',
      cron: '0 9 * * *',
      input: { topic: '周报' },
      nextRunAt: '2026-11-23T01:00:00.000Z',
    });
    const second = repo.create({
      ...base,
      workflowId: wf.id,
      cron: '0 22 * * *',
      nextRunAt: '2026-11-23T14:00:00.000Z',
    });
    expect(repo.countByWorkflow(wf.id)).toBe(2);
    expect(repo.listByWorkflow(wf.id).map((item) => item.id)).toEqual([first.id, second.id]);
    expect(repo.getById(first.id)).toMatchObject({
      name: '早间',
      cron: '0 9 * * *',
      timezone: 'Asia/Shanghai',
      input: { topic: '周报' },
      lastStatus: null,
    });
    expect(repo.getById(second.id)).toMatchObject({ name: '', cron: '0 22 * * *' });
    expect(repo.getById('missing')).toBeNull();
  });

  it('更新支持部分字段与清空 input', () => {
    const { wf, repo } = setup();
    const created = repo.create({
      ...base,
      workflowId: wf.id,
      cron: '0 9 * * *',
      input: { topic: '周报' },
      nextRunAt: '2026-11-23T01:00:00.000Z',
    });

    const renamed = repo.update(created.id, { name: '日报' });
    expect(renamed).toMatchObject({ name: '日报', cron: '0 9 * * *', input: { topic: '周报' } });

    const cleared = repo.update(created.id, { input: null, enabled: false });
    expect(cleared).toMatchObject({ input: null, enabled: false });

    const moved = repo.update(created.id, {
      timezone: 'America/New_York',
      nextRunAt: '2026-11-23T14:00:00.000Z',
    });
    expect(moved).toMatchObject({
      timezone: 'America/New_York',
      nextRunAt: '2026-11-23T14:00:00.000Z',
    });
    expect(repo.update('missing', { name: 'x' })).toBeNull();
  });

  it('到期查询只返回启用且到点的调度', () => {
    const { db, wf, repo } = setup();
    const other = createWorkflowRepository(db).createWorkflow({ name: '另一个' });
    repo.create({ ...base, workflowId: wf.id, cron: '* * * * *', nextRunAt: '2026-11-23T01:00:00.000Z' });
    repo.create({
      ...base,
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
    const view = repo.create({
      ...base,
      workflowId: wf.id,
      cron: '* * * * *',
      nextRunAt: '2026-11-23T01:00:00.000Z',
    });
    expect(repo.claimDue(view.id, '2026-11-23T01:00:00.000Z', '2026-11-23T01:01:00.000Z')).toBe(true);
    expect(repo.getById(view.id)?.nextRunAt).toBe('2026-11-23T01:01:00.000Z');
    expect(repo.claimDue(view.id, '2026-11-23T01:00:00.000Z', '2026-11-23T01:02:00.000Z')).toBe(false);
  });

  it('禁用后不能被认领', () => {
    const { wf, repo } = setup();
    const view = repo.create({
      ...base,
      workflowId: wf.id,
      cron: '* * * * *',
      enabled: false,
      nextRunAt: '2026-11-23T01:00:00.000Z',
    });
    expect(repo.claimDue(view.id, view.nextRunAt, '2026-11-23T02:00:00.000Z')).toBe(false);
  });

  it('记录结果与按条删除', () => {
    const { wf, repo } = setup();
    const view = repo.create({
      ...base,
      workflowId: wf.id,
      cron: '* * * * *',
      nextRunAt: '2026-11-23T01:00:00.000Z',
    });
    repo.recordOutcome(view.id, {
      lastRunAt: '2026-11-23T01:00:00.000Z',
      lastRunId: 'run-1',
      lastStatus: 'created',
    });
    expect(repo.getById(view.id)).toMatchObject({
      lastRunAt: '2026-11-23T01:00:00.000Z',
      lastRunId: 'run-1',
      lastStatus: 'created',
    });
    expect(repo.remove(view.id)).toBe(true);
    expect(repo.getById(view.id)).toBeNull();
    expect(repo.remove(view.id)).toBe(false);
  });
});
