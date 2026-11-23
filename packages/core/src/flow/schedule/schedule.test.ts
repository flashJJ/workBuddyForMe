import { createDatabase, createWorkflowRepository, createWorkflowRunRepository, createWorkflowScheduleRepository } from '@wbfm/database';
import { describe, expect, it, vi } from 'vitest';
import { createFlowScheduleService } from './schedule-service';
import { createFlowScheduleScheduler } from './scheduler';

function setup() {
  const db = createDatabase(':memory:');
  const workflows = createWorkflowRepository(db);
  const runs = createWorkflowRunRepository(db);
  const schedules = createWorkflowScheduleRepository(db);
  const wf = workflows.createWorkflow({ name: '定时流程' });
  workflows.addVersion(wf.id, {
    nodes: [
      { id: 'start', type: 'start', position: { x: 0, y: 0 }, config: {} },
      { id: 'end', type: 'end', position: { x: 100, y: 0 }, config: { output: 'DONE' } },
    ],
    edges: [{ id: 'e1', source: 'start', target: 'end' }],
  });
  workflows.publishVersion(wf.id);
  return { db, workflows, runs, schedules, wf };
}

const at = (h: number, m = 0) => new Date(2026, 10, 23, h, m, 0, 0);

describe('FlowScheduleService', () => {
  it('保存时校验 cron 并计算下次时间', () => {
    const { workflows, runs, schedules, wf } = setup();
    const now = () => at(10, 30);
    const service = createFlowScheduleService({ workflows, runs, schedules, flowRunner: { createRun: () => 'r1' }, now });

    const view = service.upsert(wf.id, { cron: '0 9 * * *', enabled: true });
    expect(view.cron).toBe('0 9 * * *');
    expect(new Date(view.nextRunAt)).toEqual(new Date(2026, 10, 24, 9, 0));
    expect(view.enabled).toBe(true);
  });

  it('非法 cron 与未发布流程拒绝保存', () => {
    const { workflows, runs, schedules, wf } = setup();
    const service = createFlowScheduleService({ workflows, runs, schedules, flowRunner: { createRun: () => 'r1' } });
    expect(() => service.upsert(wf.id, { cron: '60 * * * *', enabled: true })).toThrow(/分钟/);

    const draft = workflows.createWorkflow({ name: '草稿' });
    workflows.addVersion(draft.id, { nodes: [], edges: [] } as never);
    expect(() => service.upsert(draft.id, { cron: '* * * * *', enabled: true })).toThrow(/尚未发布/);
  });

  it('立即运行：在途时拒绝，否则创建 schedule 运行并记录', () => {
    const { workflows, runs, schedules, wf } = setup();
    const createRun = vi.fn(() => 'run-1');
    const service = createFlowScheduleService({ workflows, runs, schedules, flowRunner: { createRun }, now: () => at(10, 30) });
    service.upsert(wf.id, { cron: '0 9 * * *', enabled: true, input: { topic: '周报' } });

    const active = runs.createRun({ workflowId: wf.id, version: 1, trigger: 'manual' });
    expect(service.runNow(wf.id)).toEqual({ runId: null, reason: 'busy' });
    expect(createRun).not.toHaveBeenCalled();

    runs.finishRun(active.id, 'cancelled');
    expect(service.runNow(wf.id)).toEqual({ runId: 'run-1' });
    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({ workflowId: wf.id, trigger: 'schedule', input: expect.objectContaining({ topic: '周报' }) }),
    );
    expect(schedules.getByWorkflow(wf.id)?.lastStatus).toBe('created');
    expect(schedules.getByWorkflow(wf.id)?.lastRunId).toBe('run-1');
  });
});

describe('FlowScheduleScheduler', () => {
  function build(options: { cron?: string; enabled?: boolean } = {}) {
    const ctx = setup();
    const createRun = vi.fn(() => 'run-1');
    const scheduler = createFlowScheduleScheduler({
      schedules: ctx.schedules,
      workflows: ctx.workflows,
      runs: ctx.runs,
      flowRunner: { createRun },
      now: () => at(10, 30),
      catchUpOnStart: false,
    });
    ctx.schedules.upsert({
      workflowId: ctx.wf.id,
      cron: options.cron ?? '*/5 * * * *',
      enabled: options.enabled ?? true,
      input: { topic: '资讯' },
      nextRunAt: at(10, 29).toISOString(),
    });
    return { ...ctx, scheduler, createRun };
  }

  it('到期创建 schedule 运行并推进下次时间（不会同 tick 重复）', async () => {
    const { scheduler, createRun, schedules, wf } = build();
    expect(await scheduler.tick(at(10, 30))).toMatchObject({ due: 1, created: 1 });
    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: wf.id,
        trigger: 'schedule',
        input: expect.objectContaining({ topic: '资讯', scheduledAt: at(10, 30).toISOString() }),
      }),
    );
    const view = schedules.getByWorkflow(wf.id)!;
    expect(view.lastStatus).toBe('created');
    expect(view.lastRunId).toBe('run-1');
    expect(new Date(view.nextRunAt)).toEqual(at(10, 35));
    expect(await scheduler.tick(at(10, 30))).toMatchObject({ due: 0 });
  });

  it('同流程在途时跳过并记录 skipped_busy', async () => {
    const { scheduler, runs, schedules, wf, createRun } = build();
    runs.createRun({ workflowId: wf.id, version: 1, trigger: 'manual' });
    expect(await scheduler.tick(at(10, 30))).toMatchObject({ due: 1, skippedBusy: 1, created: 0 });
    expect(createRun).not.toHaveBeenCalled();
    expect(schedules.getByWorkflow(wf.id)?.lastStatus).toBe('skipped_busy');
  });

  it('禁用后不触发', async () => {
    const { scheduler, createRun } = build({ enabled: false });
    expect(await scheduler.tick(at(10, 30))).toMatchObject({ due: 0 });
    expect(createRun).not.toHaveBeenCalled();
  });

  it('重启补偿只跑一次：过期时间被推进到未来', async () => {
    const { scheduler, createRun, schedules, wf } = build({ cron: '0 * * * *' });
    // 模拟关机跨过多个整点
    expect(await scheduler.tick(at(13, 20))).toMatchObject({ due: 1, created: 1 });
    expect(createRun).toHaveBeenCalledTimes(1);
    expect(new Date(schedules.getByWorkflow(wf.id)!.nextRunAt)).toEqual(at(14, 0));
    expect(await scheduler.tick(at(13, 21))).toMatchObject({ due: 0 });
  });

  it('未发布流程记录 error 且不创建运行', async () => {
    const { scheduler, workflows, wf, createRun } = build();
    // 直接改状态模拟未发布（捕获原方法，避免自递归）
    const original = workflows.getWorkflow.bind(workflows);
    (workflows as unknown as { getWorkflow: (id: string) => unknown }).getWorkflow = (id: string) => {
      const view = original(id);
      return view && id === wf.id ? { ...view, status: 'draft' } : view;
    };
    expect(await scheduler.tick(at(10, 30))).toMatchObject({ due: 1, errored: 1, created: 0 });
    expect(createRun).not.toHaveBeenCalled();
  });

  it('同一调度不会被两个 tick 同时认领', async () => {
    const { scheduler, schedules, wf } = build();
    const view = schedules.getByWorkflow(wf.id)!;
    expect(schedules.claimDue(view.id, view.nextRunAt, at(11, 0).toISOString())).toBe(true);
    expect(schedules.claimDue(view.id, view.nextRunAt, at(11, 5).toISOString())).toBe(false);
    expect(await scheduler.tick(at(10, 30))).toMatchObject({ due: 0 });
  });
});
