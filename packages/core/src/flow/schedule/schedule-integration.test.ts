import { createDatabase, createWorkflowRepository, createWorkflowRunRepository, createWorkflowScheduleRepository } from '@wbfm/database';
import { describe, expect, it } from 'vitest';
import type { SecretCipher } from '../../secrets/cipher';
import { createPermissionService } from '../../services/permission/permission-service';
import { createTaskGrantRegistry } from '../../services/task/task-grants';
import type { ServiceDeps } from '../../services/base/deps';
import type { ToolRuntime } from '../../tools/tool-runtime';
import { createFlowRunService } from '../run/run-service';
import { drain } from '../run/run-service.helpers';
import { createFlowScheduleScheduler } from './scheduler';

describe('v4.24 定时触发集成', () => {
  it('到期调度创建 schedule 运行并执行到终态', async () => {
    const db = createDatabase(':memory:');
    const workflows = createWorkflowRepository(db);
    const runs = createWorkflowRunRepository(db);
    const schedules = createWorkflowScheduleRepository(db);
    const wf = workflows.createWorkflow({ name: '定时集成' });
    workflows.addVersion(wf.id, {
      nodes: [
        { id: 'start', type: 'start', position: { x: 0, y: 0 }, config: {} },
        { id: 'end', type: 'end', position: { x: 100, y: 0 }, config: { output: 'DONE' } },
      ],
      edges: [{ id: 'e1', source: 'start', target: 'end' }],
    });
    workflows.publishVersion(wf.id);
    const deps: ServiceDeps = {
      db,
      cipher: {} as SecretCipher,
      permissions: createPermissionService({ db, cipher: {} as SecretCipher }),
      taskGrants: createTaskGrantRegistry(),
    };
    const runtime = { resolveTool: () => null } as unknown as ToolRuntime;
    const flowRunner = createFlowRunService({ deps, runtime, workflows, runs });

    const at = new Date(2026, 10, 23, 10, 30, 0, 0);
    schedules.create({
      workflowId: wf.id,
      name: '',
      cron: '0 9 * * *',
      timezone: 'Asia/Shanghai',
      enabled: true,
      input: { topic: '资讯' },
      nextRunAt: new Date(2026, 10, 23, 9, 0).toISOString(),
    });
    const scheduler = createFlowScheduleScheduler({
      schedules,
      workflows,
      runs,
      flowRunner,
      now: () => at,
      catchUpOnStart: false,
    });

    expect(await scheduler.tick(at)).toMatchObject({ due: 1, created: 1 });
    const run = runs.listRunsByWorkflow(wf.id, 1)[0]!;
    expect(run.trigger).toBe('schedule');
    expect(run.input).toMatchObject({ topic: '资讯', scheduledAt: at.toISOString() });

    const events = await drain(flowRunner.subscribeRunEvents(run.id)!);
    expect(events[0]).toMatchObject({ type: 'run_started', trigger: 'schedule' });
    expect(events.at(-1)?.type).toBe('run_succeeded');
    expect(runs.getRun(run.id)?.status).toBe('succeeded');
    expect(schedules.listByWorkflow(wf.id)[0]?.lastStatus).toBe('created');
  });
});
