import { describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseInstance } from '../client';
import { createTaskRunRepository, type TaskRunRepository } from './task-run-repo';

/** 种子助手+会话（task_runs 外键依赖） */
function seed(db: DatabaseInstance) {
  const ts = '2026-09-30T00:00:00.000Z';
  db.prepare(`INSERT INTO assistants(id, name, created_at, updated_at) VALUES ('a1', 'A', ?, ?)`).run(ts, ts);
  db.prepare(
    `INSERT INTO conversations(id, assistant_id, title, created_at, updated_at) VALUES ('c1', 'a1', 'T', ?, ?)`,
  ).run(ts, ts);
}

function setup(): { db: DatabaseInstance; repo: TaskRunRepository } {
  const db = createDatabase();
  seed(db);
  return { db, repo: createTaskRunRepository(db) };
}

describe('task-run-repo（v0.7 M3 行动日志）', () => {
  it('createRun 默认 queued/0 计数，getRun/listRunsByConversation 往返', () => {
    const { db, repo } = setup();
    const run = repo.createRun({
      conversationId: 'c1',
      assistantId: 'a1',
      goal: '打开记事本写一段话',
      maxSteps: 20,
    });
    expect(run.status).toBe('queued');
    expect(run.stepCount).toBe(0);
    expect(run.failureCount).toBe(0);
    expect(run.maxSteps).toBe(20);
    expect(run.stopReason).toBeNull();
    expect(run.finishedAt).toBeNull();

    expect(repo.getRun(run.id)?.goal).toBe('打开记事本写一段话');
    expect(repo.getRun('missing')).toBeNull();
    const listed = repo.listRunsByConversation('c1');
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(run.id);
    expect(repo.listRunsByConversation('nope')).toHaveLength(0);
    db.close();
  });

  it('updateRunStatus 终态写 finished_at 与 stop_reason，非终态不清空', () => {
    const { db, repo } = setup();
    const run = repo.createRun({ conversationId: 'c1', assistantId: 'a1', goal: 'g', maxSteps: 5 });

    const running = repo.updateRunStatus(run.id, 'running');
    expect(running?.status).toBe('running');
    expect(running?.finishedAt).toBeNull();

    const done = repo.updateRunStatus(run.id, 'stopped', 'user_stop');
    expect(done?.status).toBe('stopped');
    expect(done?.stopReason).toBe('user_stop');
    expect(done?.finishedAt).toBeTruthy();

    expect(repo.updateRunStatus('missing', 'running')).toBeNull();
    db.close();
  });

  it('incrementRunCounters 步数/失败计数分别递增', () => {
    const { db, repo } = setup();
    const run = repo.createRun({ conversationId: 'c1', assistantId: 'a1', goal: 'g', maxSteps: 5 });

    let cur = repo.incrementRunCounters(run.id)!;
    expect([cur.stepCount, cur.failureCount]).toEqual([1, 0]);
    cur = repo.incrementRunCounters(run.id, { failed: true })!;
    expect([cur.stepCount, cur.failureCount]).toEqual([2, 1]);
    expect(repo.incrementRunCounters('missing')).toBeNull();
    db.close();
  });

  it('addStep/finishStep/listSteps 完整生命周期', () => {
    const { db, repo } = setup();
    const run = repo.createRun({ conversationId: 'c1', assistantId: 'a1', goal: 'g', maxSteps: 5 });

    const step = repo.addStep({
      runId: run.id,
      stepIndex: 1,
      kind: 'action',
      toolName: 'app_launch',
      reason: '先启动记事本',
      argsJson: '{"target":"notepad.exe"}',
    });
    expect(step.status).toBe('running');
    expect(step.toolName).toBe('app_launch');
    expect(step.resultJson).toBe('');

    const finished = repo.finishStep(step.id, {
      status: 'completed',
      resultJson: '{"ok":true}',
      durationMs: 120,
    });
    expect(finished?.status).toBe('completed');
    expect(finished?.resultJson).toBe('{"ok":true}');
    expect(finished?.durationMs).toBe(120);

    const failedStep = repo.addStep({ runId: run.id, stepIndex: 2, kind: 'observe' });
    repo.finishStep(failedStep.id, { status: 'failed', error: '截图失败' });

    const steps = repo.listSteps(run.id);
    expect(steps).toHaveLength(2);
    expect(steps[0]?.stepIndex).toBe(1);
    expect(steps[1]?.status).toBe('failed');
    expect(steps[1]?.error).toBe('截图失败');
    expect(repo.finishStep('missing', { status: 'completed' })).toBeNull();
    db.close();
  });

  it('会话删除级联清空运行与步骤', () => {
    const { db, repo } = setup();
    const run = repo.createRun({ conversationId: 'c1', assistantId: 'a1', goal: 'g', maxSteps: 5 });
    repo.addStep({ runId: run.id, stepIndex: 1, kind: 'observe' });

    db.prepare(`DELETE FROM conversations WHERE id='c1'`).run();
    expect(repo.getRun(run.id)).toBeNull();
    expect(repo.listSteps(run.id)).toHaveLength(0);
    db.close();
  });
});
