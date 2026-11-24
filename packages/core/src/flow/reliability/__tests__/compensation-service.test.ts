import { describe, expect, it, vi } from 'vitest';
import { createDatabase } from '@wbfm/database';
import {
  createWorkflowRepository,
  createWorkflowRunRepository,
  createFlowRunCompensationRepository,
} from '@wbfm/database';
import type { FlowRunReplayService } from '../run-replay-service';
import { createFlowCompensationService } from '../compensation-service';

function setup() {
  const db = createDatabase(':memory:');
  const workflows = createWorkflowRepository(db);
  const runs = createWorkflowRunRepository(db);
  const compensations = createFlowRunCompensationRepository(db);
  const wf = workflows.createWorkflow({ name: '补偿' });
  const replay: FlowRunReplayService = {
    replayOne: vi.fn(() => {
      const retry = runs.createRun({ workflowId: wf.id, version: 1, trigger: 'manual' });
      return { runId: retry.id, parentRunId: 'parent' };
    }),
    replayBatch: vi.fn(),
  };
  const service = createFlowCompensationService({ runs, compensations, workflows, replay });
  return { db, workflows, runs, compensations, replay, service, wf };
}

function failRun(runs: ReturnType<typeof createWorkflowRunRepository>, wfId: string, code = 'network') {
  const run = runs.createRun({ workflowId: wfId, version: 1, trigger: 'schedule' });
  runs.finishRun(run.id, 'failed', { error: { code, message: code } });
  return runs.getRun(run.id)!;
}

describe('v5.0 补偿队列', () => {
  it('仅无人值守 + 可重试失败创建补偿行，30s 后 sweep 创建快照重放', () => {
    const { runs, compensations, replay, service, wf } = setup();
    const run = failRun(runs, wf.id);
    service.onRunTerminal(run);

    const pending = compensations.getByRootRun(run.id);
    expect(pending).toMatchObject({ attempt: 1, state: 'pending' });
    expect(Date.parse(pending!.nextRetryAt!)).toBeGreaterThan(Date.now() + 25_000);

    const dueAt = new Date(Date.parse(pending!.nextRetryAt!) + 1_000);
    const result = service.sweep(dueAt);
    expect(result.started).toBe(1);
    expect(replay.replayOne).toHaveBeenCalledWith({
      runId: run.id,
      mode: 'snapshot',
      nodeMode: 'failed_node',
      trigger: 'schedule',
    });
    expect(compensations.getByRootRun(run.id)?.state).toBe('retrying');
  });

  it('人工触发/不可重试错误不创建补偿行', () => {
    const { runs, compensations, service, wf } = setup();
    const manual = runs.createRun({ workflowId: wf.id, version: 1, trigger: 'manual' });
    runs.finishRun(manual.id, 'failed', { error: { code: 'config', message: 'config invalid' } });
    service.onRunTerminal(runs.getRun(manual.id)!);
    expect(compensations.getByRootRun(manual.id)).toBeNull();

    const auth = failRun(runs, wf.id, 'auth');
    service.onRunTerminal(auth);
    expect(compensations.getByRootRun(auth.id)).toBeNull();
  });

  it('重试成功 recovered；第 3 次失败 exhausted', () => {
    const { runs, compensations, service, wf } = setup();
    const root = failRun(runs, wf.id);
    service.onRunTerminal(root);

    const retry1 = runs.createRun({ workflowId: wf.id, version: 1, trigger: 'manual' });
    const item = compensations.getByRootRun(root.id)!;
    expect(compensations.claim(item.id, item.nextRetryAt!)).toBe(true);
    compensations.markRetrying(item.id, retry1.id);
    runs.finishRun(retry1.id, 'succeeded');
    service.onRunTerminal(runs.getRun(retry1.id)!);
    expect(compensations.getByRootRun(root.id)?.state).toBe('recovered');

    const root2 = failRun(runs, wf.id);
    service.onRunTerminal(root2);
    const exhausted = compensations.getByRootRun(root2.id)!;
    compensations.markPending(exhausted.id, 3, new Date(Date.now() - 1_000).toISOString(), '{}');
    const retry3 = runs.createRun({ workflowId: wf.id, version: 1, trigger: 'manual' });
    const due = compensations.getByRootRun(root2.id)!;
    expect(compensations.claim(due.id, due.nextRetryAt!)).toBe(true);
    compensations.markRetrying(due.id, retry3.id);
    runs.finishRun(retry3.id, 'failed', { error: { code: 'auth', message: 'auth' } });
    service.onRunTerminal(runs.getRun(retry3.id)!);
    expect(compensations.getByRootRun(root2.id)?.state).toBe('exhausted');
  });

  it('流程有在途运行时顺延 60s，不消耗尝试次数', () => {
    const { runs, compensations, service, wf } = setup();
    const root = failRun(runs, wf.id);
    service.onRunTerminal(root);
    runs.createRun({ workflowId: wf.id, version: 1, trigger: 'manual' }); // queued 在途

    const item = compensations.getByRootRun(root.id)!;
    const result = service.sweep(new Date(Date.parse(item.nextRetryAt!) + 1_000));
    expect(result.deferred).toBe(1);
    const after = compensations.getByRootRun(root.id)!;
    expect(after).toMatchObject({ state: 'pending', attempt: 1 });
    expect(Date.parse(after.nextRetryAt!)).toBeGreaterThan(Date.parse(item.nextRetryAt!) + 50_000);
  });

  it('recover：claim 后崩溃（无 lastRun）立即回到 pending', () => {
    const { runs, compensations, service, wf } = setup();
    const root = failRun(runs, wf.id);
    service.onRunTerminal(root);
    const item = compensations.getByRootRun(root.id)!;
    expect(compensations.claim(item.id, item.nextRetryAt!)).toBe(true);

    const result = service.recover();
    expect(result.requeued).toBe(1);
    const after = compensations.getByRootRun(root.id)!;
    expect(after).toMatchObject({ state: 'pending', attempt: 1 });
    expect(Date.parse(after.nextRetryAt!)).toBeLessThanOrEqual(Date.now() + 1_000);
  });

  it('recover：重放被中断计一次尝试；后续成功则 recovered', () => {
    const { runs, compensations, service, wf } = setup();
    const root = failRun(runs, wf.id);
    service.onRunTerminal(root);
    const item = compensations.getByRootRun(root.id)!;
    expect(compensations.claim(item.id, item.nextRetryAt!)).toBe(true);
    const retry = runs.createRun({ workflowId: wf.id, version: 1, trigger: 'schedule' });
    compensations.markRetrying(item.id, retry.id);
    runs.finishRun(retry.id, 'interrupted');

    const first = service.recover();
    expect(first.requeued).toBe(1);
    const after = compensations.getByRootRun(root.id)!;
    expect(after).toMatchObject({ state: 'pending', attempt: 2 });

    expect(compensations.claim(after.id, after.nextRetryAt!)).toBe(true);
    const retry2 = runs.createRun({ workflowId: wf.id, version: 1, trigger: 'schedule' });
    compensations.markRetrying(after.id, retry2.id);
    runs.finishRun(retry2.id, 'succeeded');
    const second = service.recover();
    expect(second.recovered).toBe(1);
    expect(compensations.getByRootRun(root.id)?.state).toBe('recovered');
  });

  it('recover：重放仍在排队时保持 retrying，交给终态事件', () => {
    const { runs, compensations, service, wf } = setup();
    const root = failRun(runs, wf.id);
    service.onRunTerminal(root);
    const item = compensations.getByRootRun(root.id)!;
    expect(compensations.claim(item.id, item.nextRetryAt!)).toBe(true);
    const retry = runs.createRun({ workflowId: wf.id, version: 1, trigger: 'schedule' });
    compensations.markRetrying(item.id, retry.id);

    expect(service.recover()).toMatchObject({ skipped: 1 });
    expect(compensations.getByRootRun(root.id)?.state).toBe('retrying');
  });

  it('运行期补偿重放被中断：终态回调直接排下一次', () => {
    const { runs, compensations, service, wf } = setup();
    const root = failRun(runs, wf.id);
    service.onRunTerminal(root);
    const item = compensations.getByRootRun(root.id)!;
    expect(compensations.claim(item.id, item.nextRetryAt!)).toBe(true);
    const retry = runs.createRun({ workflowId: wf.id, version: 1, trigger: 'schedule' });
    compensations.markRetrying(item.id, retry.id);
    runs.finishRun(retry.id, 'interrupted');

    service.onRunTerminal(runs.getRun(retry.id)!);
    const after = compensations.getByRootRun(root.id)!;
    expect(after).toMatchObject({ state: 'pending', attempt: 2 });
    expect(after.nextRetryAt).not.toBeNull();
  });
});
