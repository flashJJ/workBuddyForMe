import { createDatabase, createWorkflowRepository, createWorkflowRunRepository, createWorkflowScheduleRepository } from '@wbfm/database';
import { describe, expect, it, vi } from 'vitest';
import type { CreateRunParams } from '../run/run-service-types';
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

const AT = new Date('2026-11-23T02:30:00.000Z'); // 上海 10:30
const baseSchedule = {
  name: '',
  timezone: 'Asia/Shanghai',
  enabled: true,
  nextRunAt: '2026-11-23T01:00:00.000Z',
};

describe('FlowScheduleService（v4.26 多定时）', () => {
  it('创建时校验 cron，按指定时区计算下次时间', () => {
    const { workflows, runs, schedules, wf } = setup();
    const service = createFlowScheduleService({
      workflows,
      runs,
      schedules,
      flowRunner: { createRun: () => 'r1' },
      now: () => AT,
    });

    const view = service.create(wf.id, {
      name: ' 早间 ',
      cron: '0 9 * * *',
      timezone: 'Asia/Shanghai',
      enabled: true,
    });
    expect(view).toMatchObject({ name: '早间', cron: '0 9 * * *', timezone: 'Asia/Shanghai' });
    expect(view.nextRunAt).toBe('2026-11-24T01:00:00.000Z');
  });

  it('非法 cron、未知时区与未发布流程拒绝创建', () => {
    const { workflows, runs, schedules, wf } = setup();
    const service = createFlowScheduleService({ workflows, runs, schedules, flowRunner: { createRun: () => 'r1' } });
    expect(() =>
      service.create(wf.id, { cron: '60 * * * *', timezone: 'Asia/Shanghai', enabled: true }),
    ).toThrow(/分钟/);
    expect(() =>
      service.create(wf.id, { cron: '* * * * *', timezone: 'Mars/Olympus', enabled: true }),
    ).toThrow(/时区/);

    const draft = workflows.createWorkflow({ name: '草稿' });
    workflows.addVersion(draft.id, { nodes: [], edges: [] } as never);
    expect(() =>
      service.create(draft.id, { cron: '* * * * *', timezone: 'Asia/Shanghai', enabled: true }),
    ).toThrow(/尚未发布/);
  });

  it('每流程最多 5 条定时', () => {
    const { workflows, runs, schedules, wf } = setup();
    const service = createFlowScheduleService({
      workflows,
      runs,
      schedules,
      flowRunner: { createRun: () => 'r1' },
      now: () => AT,
    });
    for (let index = 0; index < 5; index += 1) {
      service.create(wf.id, { cron: `${index} 9 * * *`, timezone: 'Asia/Shanghai', enabled: true });
    }
    expect(service.list(wf.id)).toHaveLength(5);
    expect(() =>
      service.create(wf.id, { cron: '0 10 * * *', timezone: 'Asia/Shanghai', enabled: true }),
    ).toThrow(/最多 5 条/);
  });

  it('仅改名称不移动下次时间；改时区或停用转启用会重算', () => {
    const { workflows, runs, schedules, wf } = setup();
    const service = createFlowScheduleService({
      workflows,
      runs,
      schedules,
      flowRunner: { createRun: () => 'r1' },
      now: () => AT,
    });
    const created = service.create(wf.id, {
      cron: '0 9 * * *',
      timezone: 'Asia/Shanghai',
      enabled: false,
    });
    expect(created.nextRunAt).toBe('2026-11-24T01:00:00.000Z');

    const renamed = service.update(wf.id, created.id, { name: '早间' });
    expect(renamed.name).toBe('早间');
    expect(renamed.nextRunAt).toBe(created.nextRunAt);

    const moved = service.update(wf.id, created.id, { timezone: 'America/New_York' });
    expect(moved.timezone).toBe('America/New_York');
    expect(moved.nextRunAt).not.toBe(created.nextRunAt);

    const enabled = service.update(wf.id, created.id, { enabled: true });
    expect(enabled.enabled).toBe(true);
    expect(service.update(wf.id, created.id, { input: null }).input).toBeNull();
    expect(() => service.update(wf.id, 'missing', { name: 'x' })).toThrow(/定时/);
  });

  it('启用未发布流程的定时被拒绝', () => {
    const { workflows, runs, schedules, wf } = setup();
    const service = createFlowScheduleService({
      workflows,
      runs,
      schedules,
      flowRunner: { createRun: () => 'r1' },
      now: () => AT,
    });
    const created = service.create(wf.id, { cron: '0 9 * * *', timezone: 'Asia/Shanghai', enabled: false });
    const original = workflows.getWorkflow.bind(workflows);
    (workflows as unknown as { getWorkflow: (id: string) => unknown }).getWorkflow = (id: string) => {
      const view = original(id);
      return view && id === wf.id ? { ...view, status: 'draft' } : view;
    };
    expect(() => service.update(wf.id, created.id, { enabled: true })).toThrow(/尚未发布/);
  });

  it('立即运行：指定条目使用其入参并回写该条状态', () => {
    const { workflows, runs, schedules, wf } = setup();
    const createRun = vi.fn(() => 'run-1');
    const service = createFlowScheduleService({
      workflows,
      runs,
      schedules,
      flowRunner: { createRun },
      now: () => AT,
    });
    const morning = service.create(wf.id, {
      name: '早间',
      cron: '0 9 * * *',
      timezone: 'Asia/Shanghai',
      enabled: true,
      input: { topic: '周报' },
    });
    const evening = service.create(wf.id, {
      name: '晚间',
      cron: '0 22 * * *',
      timezone: 'Asia/Shanghai',
      enabled: true,
      input: { topic: '归档' },
    });

    const active = runs.createRun({ workflowId: wf.id, version: 1, trigger: 'manual' });
    expect(service.runNow(wf.id, morning.id)).toEqual({ runId: null, reason: 'busy' });
    runs.finishRun(active.id, 'cancelled');

    expect(service.runNow(wf.id, morning.id)).toEqual({ runId: 'run-1' });
    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: wf.id,
        trigger: 'schedule',
        input: expect.objectContaining({ topic: '周报', scheduleId: morning.id }),
      }),
    );
    expect(service.list(wf.id).find((item) => item.id === morning.id)?.lastStatus).toBe('created');
    expect(service.list(wf.id).find((item) => item.id === evening.id)?.lastStatus).toBeNull();
  });
});

describe('FlowScheduleScheduler（v4.26 多定时/时区）', () => {
  function build(options: { schedulers?: Array<{ cron: string; enabled?: boolean; timezone?: string }> } = {}) {
    const ctx = setup();
    const createRun = vi.fn((params: CreateRunParams) => {
      const run = ctx.runs.createRun({
        workflowId: params.workflowId,
        version: 1,
        trigger: params.trigger ?? 'schedule',
        input: params.input,
      });
      return run.id;
    });
    const scheduler = createFlowScheduleScheduler({
      schedules: ctx.schedules,
      workflows: ctx.workflows,
      runs: ctx.runs,
      flowRunner: { createRun },
      now: () => AT,
      catchUpOnStart: false,
    });
    const items = options.schedulers ?? [{ cron: '*/5 * * * *' }];
    for (const item of items) {
      ctx.schedules.create({
        workflowId: ctx.wf.id,
        name: '',
        cron: item.cron,
        timezone: item.timezone ?? 'Asia/Shanghai',
        enabled: item.enabled ?? true,
        input: { topic: '资讯' },
        nextRunAt: '2026-11-23T02:29:00.000Z',
      });
    }
    return { ...ctx, scheduler, createRun };
  }

  it('按条目时区推进下次时间', async () => {
    const { scheduler, schedules, wf } = build({ schedulers: [{ cron: '0 9 * * *', timezone: 'America/New_York' }] });
    const result = await scheduler.tick(AT);
    expect(result).toMatchObject({ due: 1, created: 1 });
    // 纽约当前为 11 月 22 日 21:30 EST，下一次 9:00 为 11 月 23 日 14:00Z
    expect(schedules.listByWorkflow(wf.id)[0]?.nextRunAt).toBe('2026-11-23T14:00:00.000Z');
  });

  it('同流程多条同时到期只创建一个运行，其余记录 skipped_busy', async () => {
    const { scheduler, schedules, wf } = build({
      schedulers: [{ cron: '*/5 * * * *' }, { cron: '*/5 * * * *' }],
    });
    const result = await scheduler.tick(AT);
    expect(result).toMatchObject({ due: 2, created: 1, skippedBusy: 1 });
    const statuses = schedules.listByWorkflow(wf.id).map((item) => item.lastStatus).sort();
    expect(statuses).toEqual(['created', 'skipped_busy']);
  });

  it('禁用后不触发', async () => {
    const { scheduler, createRun } = build({ schedulers: [{ cron: '*/5 * * * *', enabled: false }] });
    expect(await scheduler.tick(AT)).toMatchObject({ due: 0 });
    expect(createRun).not.toHaveBeenCalled();
  });

  it('重启补偿只跑一次：过期时间被推进到未来', async () => {
    const { scheduler, createRun, schedules, wf } = build({ schedulers: [{ cron: '0 * * * *' }] });
    expect(await scheduler.tick(AT)).toMatchObject({ due: 1, created: 1 });
    expect(createRun).toHaveBeenCalledTimes(1);
    expect(schedules.listByWorkflow(wf.id)[0]?.nextRunAt).toBe('2026-11-23T03:00:00.000Z');
    expect(await scheduler.tick(AT)).toMatchObject({ due: 0 });
  });

  it('未发布流程记录 error 且不创建运行', async () => {
    const { scheduler, workflows, wf, createRun } = build();
    const original = workflows.getWorkflow.bind(workflows);
    (workflows as unknown as { getWorkflow: (id: string) => unknown }).getWorkflow = (id: string) => {
      const view = original(id);
      return view && id === wf.id ? { ...view, status: 'draft' } : view;
    };
    expect(await scheduler.tick(AT)).toMatchObject({ due: 1, errored: 1, created: 0 });
    expect(createRun).not.toHaveBeenCalled();
  });

  it('无效 cron 记录 error 并自动停用，避免每 tick 重复失败', async () => {
    const { scheduler, schedules, wf } = build({ schedulers: [{ cron: 'not-a-cron' }] });
    expect(await scheduler.tick(AT)).toMatchObject({ due: 1, errored: 1, created: 0 });
    expect(schedules.listByWorkflow(wf.id)[0]).toMatchObject({
      enabled: false,
      lastStatus: 'error',
    });
    expect(await scheduler.tick(AT)).toMatchObject({ due: 0 });
  });

  it('同一调度不会被两个 tick 同时认领', async () => {
    const { scheduler, schedules, wf } = build();
    const view = schedules.listByWorkflow(wf.id)[0]!;
    expect(schedules.claimDue(view.id, view.nextRunAt, '2026-11-23T03:00:00.000Z')).toBe(true);
    expect(schedules.claimDue(view.id, view.nextRunAt, '2026-11-23T03:05:00.000Z')).toBe(false);
    expect(await scheduler.tick(AT)).toMatchObject({ due: 0 });
  });
});
