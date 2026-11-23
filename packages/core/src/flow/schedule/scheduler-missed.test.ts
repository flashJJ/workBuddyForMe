import { describe, expect, it } from 'vitest';
import { createDatabase } from '@wbfm/database';
import {
  createWorkflowRepository,
  createWorkflowRunRepository,
  createWorkflowScheduleRepository,
} from '@wbfm/database';
import type { FlowGraph } from '@wbfm/shared/schemas';
import { createFlowScheduleScheduler } from './scheduler';

const graph = {
  nodes: [
    { id: 'start', type: 'start', position: { x: 0, y: 0 } },
    { id: 'end', type: 'end', position: { x: 1, y: 1 } },
  ],
  edges: [{ id: 'e1', source: 'start', target: 'end' }],
} as FlowGraph;

describe('v5.0 定时错过计数', () => {
  it('跨过多个周期时累计 missed_count，仍只补跑一次', async () => {
    const db = createDatabase(':memory:');
    const workflows = createWorkflowRepository(db);
    const runs = createWorkflowRunRepository(db);
    const schedules = createWorkflowScheduleRepository(db);
    const wf = workflows.createWorkflow({ name: '错过' });
    workflows.addVersion(wf.id, graph);
    workflows.publishVersion(wf.id);
    const schedule = schedules.create({
      workflowId: wf.id,
      name: '',
      cron: '0 9 * * *',
      timezone: 'Asia/Shanghai',
      enabled: true,
      nextRunAt: '2026-11-22T01:00:00.000Z',
    });
    let created = 0;
    const scheduler = createFlowScheduleScheduler({
      schedules,
      workflows,
      runs,
      flowRunner: {
        createRun: () => {
          created += 1;
          return 'run-1';
        },
      },
      now: () => new Date('2026-11-24T02:00:00.000Z'),
    });

    const result = await scheduler.tick(new Date('2026-11-24T02:00:00.000Z'));
    expect(result.created).toBe(1);
    expect(created).toBe(1);
    expect(schedules.getById(schedule.id)?.missedCount).toBe(2);
    expect(schedules.getById(schedule.id)?.lastMissedAt).toBe('2026-11-24T02:00:00.000Z');
  });
});
