import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createAgentRunRepository,
  createDatabase,
  createTaskRunRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { recoverInterruptedRunJobs, convergeOrphanTaskRun } from './run-recovery';

describe('v2.8 重启恢复', () => {
  let db: DatabaseInstance;

  beforeEach(() => {
    db = createDatabase();
    const ts = '2026-10-29T00:00:00.000Z';
    db.prepare(
      `INSERT INTO assistants(id, name, created_at, updated_at) VALUES ('a1', 'A', ?, ?)`,
    ).run(ts, ts);
    db.prepare(
      `INSERT INTO conversations(id, assistant_id, title, created_at, updated_at) VALUES ('c1', 'a1', 'T', ?, ?)`,
    ).run(ts, ts);
  });

  afterEach(() => db.close());

  it('非终态任务收敛为 stopped(interrupted)，协作收敛为 cancelled', () => {
    const tasks = createTaskRunRepository(db);
    const queued = tasks.createRun({ conversationId: 'c1', assistantId: 'a1', goal: 'Q', maxSteps: 3 });
    const running = tasks.createRun({ conversationId: 'c1', assistantId: 'a1', goal: 'R', maxSteps: 3 });
    tasks.updateRunStatus(running.id, 'running');
    const paused = tasks.createRun({ conversationId: 'c1', assistantId: 'a1', goal: 'P', maxSteps: 3 });
    tasks.updateRunStatus(paused.id, 'paused');
    const done = tasks.createRun({ conversationId: 'c1', assistantId: 'a1', goal: 'D', maxSteps: 3 });
    tasks.updateRunStatus(done.id, 'completed', 'completed');

    const agents = createAgentRunRepository(db);
    const agent = agents.create({ assistantId: 'a1', goal: '协作' });

    const result = recoverInterruptedRunJobs(db);
    expect(result.tasks).toBe(3);
    expect(result.agents).toBe(1);

    for (const id of [queued.id, running.id, paused.id]) {
      const run = tasks.getRun(id)!;
      expect(run.status).toBe('stopped');
      expect(run.stopReason).toBe('interrupted');
      expect(run.finishedAt).toBeTruthy();
    }
    expect(tasks.getRun(done.id)!.status).toBe('completed');
    expect(agents.getById(agent.id)!.status).toBe('cancelled');
    expect(agents.getById(agent.id)!.errorCode).toBe('INTERRUPTED');

    // 幂等：再次调用不再改动
    expect(recoverInterruptedRunJobs(db)).toEqual({ tasks: 0, agents: 0 });
  });

  it('convergeOrphanTaskRun 只收敛单条非终态运行', () => {
    const tasks = createTaskRunRepository(db);
    const run = tasks.createRun({ conversationId: 'c1', assistantId: 'a1', goal: 'R', maxSteps: 3 });
    tasks.updateRunStatus(run.id, 'running');
    expect(convergeOrphanTaskRun(db, run.id)).toBe(true);
    expect(tasks.getRun(run.id)!.stopReason).toBe('interrupted');
    expect(convergeOrphanTaskRun(db, run.id)).toBe(false);
  });
});
