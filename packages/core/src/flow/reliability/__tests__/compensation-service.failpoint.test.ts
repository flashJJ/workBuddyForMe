import { describe, expect, it, vi } from 'vitest';
import {
  createDatabase,
  createFlowRunCompensationRepository,
  createWorkflowRepository,
  createWorkflowRunRepository,
} from '@wbfm/database';
import { FLOW_COMPENSATION_BACKOFF_MS } from '@wbfm/shared/schemas';
import type { FlowTrigger } from '@wbfm/shared/types';
import type { FlowRunReplayService } from '../run-replay-service';
import { createFlowCompensationService } from '../compensation-service';

/**
 * v5.0.1 回归：safer-sweep 失败注入。
 * 覆盖矩阵用例没有触达的两条崩溃边界：
 * 1. claim 成功后进程退出（retrying 且无 lastRunId）→ recover 必须回到 pending；
 * 2. markRetrying 写库失败 → sweep 必须收敛为 exhausted，不能留下无主 retrying。
 */

const T0 = new Date('2026-11-24T00:00:00.000Z');

function createHarness(
  overrides: Partial<ReturnType<typeof createFlowRunCompensationRepository>> = {},
) {
  const db = createDatabase(':memory:');
  const workflows = createWorkflowRepository(db);
  const runs = createWorkflowRunRepository(db);
  const base = createFlowRunCompensationRepository(db);
  const compensations = { ...base, ...overrides };
  const wf = workflows.createWorkflow({ name: '故障注入' });
  const replayOne = vi.fn((input: Parameters<FlowRunReplayService['replayOne']>[0]) => {
    const run = runs.createRun({
      workflowId: wf.id,
      version: 1,
      trigger: input.trigger ?? 'manual',
    });
    return { runId: run.id, parentRunId: input.runId };
  });
  const replay = { replayOne, replayBatch: vi.fn() } as unknown as FlowRunReplayService;
  const service = createFlowCompensationService({
    runs,
    compensations,
    workflows,
    replay,
    now: () => new Date(T0),
  });
  return { db, workflows, runs, compensations, wf, replayOne, service };
}

function failRoot(
  h: ReturnType<typeof createHarness>,
  trigger: FlowTrigger = 'schedule',
): { rootId: string; compensationId: string } {
  const root = h.runs.createRun({ workflowId: h.wf.id, version: 1, trigger });
  h.runs.finishRun(root.id, 'failed', { error: { code: 'network', message: 'reset' } });
  h.service.onRunTerminal(h.runs.getRun(root.id)!);
  const compensation = h.compensations.getByRootRun(root.id)!;
  return { rootId: root.id, compensationId: compensation.id };
}

describe('v5.0.1 补偿失败注入', () => {
  it('claim 后崩溃：无 lastRunId 的 retrying 由 recover 回到 pending 并用根运行续跑', () => {
    const h = createHarness();
    const { rootId, compensationId } = failRoot(h);
    const pending = h.compensations.getByRootRun(rootId)!;

    expect(h.compensations.claim(compensationId, pending.nextRetryAt!)).toBe(true);
    expect(h.compensations.getByRootRun(rootId)).toMatchObject({
      state: 'retrying',
      lastRunId: null,
    });

    // 进程退出：不调用 markRetrying，直接换实例恢复
    const restarted = createFlowCompensationService({
      runs: h.runs,
      compensations: h.compensations,
      workflows: h.workflows,
      replay: { replayOne: h.replayOne, replayBatch: vi.fn() } as unknown as FlowRunReplayService,
      now: () => new Date(T0),
    });
    expect(restarted.recover()).toMatchObject({ requeued: 1 });
    const afterRecover = h.compensations.getByRootRun(rootId)!;
    expect(afterRecover).toMatchObject({ state: 'pending', attempt: 1, lastRunId: null });

    const due = new Date(afterRecover.nextRetryAt!);
    const resumed = createFlowCompensationService({
      runs: h.runs,
      compensations: h.compensations,
      workflows: h.workflows,
      replay: { replayOne: h.replayOne, replayBatch: vi.fn() } as unknown as FlowRunReplayService,
      now: () => due,
    });
    expect(resumed.sweep()).toMatchObject({ claimed: 1, started: 1 });
    expect(h.replayOne).toHaveBeenCalledWith(
      expect.objectContaining({ runId: rootId, trigger: 'schedule', mode: 'snapshot' }),
    );
    expect(h.compensations.getByRootRun(rootId)?.state).toBe('retrying');
  });

  it('markRetrying 写库失败：sweep 收敛为 exhausted，不残留 retrying', () => {
    const h = createHarness({
      markRetrying: () => {
        throw new Error('database is locked');
      },
    });
    const { rootId } = failRoot(h);
    const due = new Date(T0.getTime() + FLOW_COMPENSATION_BACKOFF_MS[0]);

    const result = createFlowCompensationService({
      runs: h.runs,
      compensations: h.compensations,
      workflows: h.workflows,
      replay: { replayOne: h.replayOne, replayBatch: vi.fn() } as unknown as FlowRunReplayService,
      now: () => due,
    }).sweep();

    expect(result).toMatchObject({ claimed: 1, started: 0 });
    const after = h.compensations.getByRootRun(rootId)!;
    expect(after.state).toBe('exhausted');
    expect(after.lastError?.code).toBe('flow/compensation-replay-failed');
    expect(h.compensations.listRetrying()).toEqual([]);
  });
});
