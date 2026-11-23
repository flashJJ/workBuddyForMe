import { describe, expect, it } from 'vitest';
import { createDatabase } from '@wbfm/database';
import {
  createFlowRunCompensationRepository,
  createSettingsRepository,
  createWorkflowRepository,
  createWorkflowScheduleRepository,
  createWorkflowTriggerRepository,
} from '@wbfm/database';
import { createFlowRuntimeHealthService } from '../runtime-health-service';

describe('v5.0 运行健康', () => {
  it('聚合调度心跳、定时错过、触发器与保留统计', () => {
    const db = createDatabase(':memory:');
    const workflows = createWorkflowRepository(db);
    const schedules = createWorkflowScheduleRepository(db);
    const triggers = createWorkflowTriggerRepository(db);
    const compensations = createFlowRunCompensationRepository(db);
    const settings = createSettingsRepository(db);
    const wf = workflows.createWorkflow({ name: '健康流程' });
    const schedule = schedules.create({
      workflowId: wf.id,
      name: '早报',
      cron: '0 9 * * *',
      timezone: 'Asia/Shanghai',
      enabled: true,
      nextRunAt: '2026-11-24T01:00:00.000Z',
    });
    schedules.recordMissed(schedule.id, 2, '2026-11-24T02:00:00.000Z');
    const trigger = triggers.create({
      workflowId: wf.id,
      kind: 'webhook',
      name: '外部触发',
      config: null,
      secretHash: 'h',
    });
    settings.setJson('flows.runRetention.lastCleanupAt', '2026-11-23T00:00:00.000Z');
    settings.setJson('flows.runRetention.removedTotal', 7);

    const service = createFlowRuntimeHealthService({
      workflows,
      schedules,
      triggers,
      compensations,
      settings,
      scheduler: {
        stats: () => ({
          running: true,
          startedAt: '2026-11-24T00:00:00.000Z',
          lastTickAt: '2026-11-24T00:04:30.000Z',
          tickCount: 3,
          lastError: null,
        }),
      },
      fileWatcher: {
        stats: () => ({
          active: true,
          watchingCount: 2,
          lastEventAt: '2026-11-24T00:01:00.000Z',
          lastError: null,
        }),
      },
      now: () => new Date('2026-11-24T00:05:00.000Z'),
    });

    const view = service.snapshot();
    expect(view.scheduler).toMatchObject({ running: true, tickCount: 3, stalled: false });
    expect(view.fileWatcher).toMatchObject({ active: true, watchingCount: 2 });
    expect(view.compensation).toMatchObject({ pending: 0, exhausted: 0 });
    expect(view.schedules[0]).toMatchObject({
      scheduleId: schedule.id,
      workflowName: '健康流程',
      missedCount: 2,
      lastMissedAt: '2026-11-24T02:00:00.000Z',
    });
    expect(view.triggers[0]).toMatchObject({
      triggerId: trigger.id,
      kind: 'webhook',
      name: '外部触发',
    });
    expect(view.retention).toEqual({
      lastCleanupAt: '2026-11-23T00:00:00.000Z',
      removedTotal: 7,
    });
  });

  it('心跳超过 3 个 tick 标记 stalled', () => {
    const db = createDatabase(':memory:');
    const service = createFlowRuntimeHealthService({
      workflows: createWorkflowRepository(db),
      schedules: createWorkflowScheduleRepository(db),
      triggers: createWorkflowTriggerRepository(db),
      compensations: createFlowRunCompensationRepository(db),
      settings: createSettingsRepository(db),
      scheduler: {
        stats: () => ({
          running: true,
          startedAt: '2026-11-24T00:00:00.000Z',
          lastTickAt: '2026-11-24T00:00:00.000Z',
          tickCount: 1,
          lastError: 'boom',
        }),
      },
      now: () => new Date('2026-11-24T00:02:00.000Z'),
    });
    expect(service.snapshot().scheduler).toMatchObject({ stalled: true, lastError: 'boom' });
  });
});
