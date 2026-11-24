import { describe, expect, it, vi } from 'vitest';
import { createDatabase } from '@wbfm/database';
import {
  createFlowRunCompensationRepository,
  createWorkflowRepository,
  createWorkflowRunRepository,
} from '@wbfm/database';
import {
  FLOW_COMPENSATION_BACKOFF_MS,
  FLOW_COMPENSATION_MAX_ATTEMPTS,
} from '@wbfm/shared/schemas';
import type { FlowTrigger } from '@wbfm/shared/types';
import type { AuditService } from '../../../governance/audit';
import type { FlowRunReplayService } from '../run-replay-service';
import { createFlowCompensationService } from '../compensation-service';

/**
 * v5.0.1 回归：补偿状态机矩阵。
 * 用 ManualClock 取代真实时间，表驱动覆盖退避阶梯、非法/重复转换、sweep 边界与重启恢复。
 */

const T0 = new Date('2026-11-24T00:00:00.000Z');

function createClock() {
  let current = new Date(T0);
  return {
    now: () => new Date(current),
    advance(ms: number) {
      current = new Date(current.getTime() + ms);
    },
  };
}

type Runs = ReturnType<typeof createWorkflowRunRepository>;
type GetRun = Runs['getRun'];

interface HarnessOptions {
  /** 模拟记录在库但读取不到（例如已被外部删除）的 run */
  getRunOverride?: (id: string, base: Runs) => ReturnType<GetRun>;
}

function createHarness(options: HarnessOptions = {}) {
  const db = createDatabase(':memory:');
  const workflows = createWorkflowRepository(db);
  const runs = createWorkflowRunRepository(db);
  const compensations = createFlowRunCompensationRepository(db);
  const wf = workflows.createWorkflow({ name: '矩阵' });
  const clock = createClock();
  const audit = { safeAppend: vi.fn(() => null) } as unknown as AuditService;
  const replayOne = vi.fn((input: Parameters<FlowRunReplayService['replayOne']>[0]) => {
    const run = runs.createRun({
      workflowId: wf.id,
      version: 1,
      trigger: input.trigger ?? 'manual',
    });
    return { runId: run.id, parentRunId: 'parent' };
  });
  const replay: FlowRunReplayService = { replayOne, replayBatch: vi.fn() };

  let runsForService: Runs = runs;
  if (options.getRunOverride) {
    runsForService = Object.create(runs) as Runs;
    runsForService.getRun = (id) => options.getRunOverride!(id, runs);
  }
  const service = createFlowCompensationService({
    runs: runsForService,
    compensations,
    workflows,
    replay,
    audit,
    now: clock.now,
  });
  return { db, workflows, runs, compensations, wf, clock, audit, replay, replayOne, service };
}

function failRun(runs: Runs, wfId: string, code = 'network', trigger: FlowTrigger = 'schedule') {
  const run = runs.createRun({ workflowId: wfId, version: 1, trigger });
  runs.finishRun(run.id, 'failed', { error: { code, message: code } });
  return runs.getRun(run.id)!;
}

describe('v5.0.1 补偿状态机矩阵', () => {
  it('退避阶梯 30s/2m/10m，第 3 次失败后耗尽并写审计', () => {
    const h = createHarness();
    const root = failRun(h.runs, h.wf.id);
    h.service.onRunTerminal(root);

    let item = h.compensations.getByRootRun(root.id)!;
    const delays: number[] = [];
    for (let attempt = 1; attempt <= FLOW_COMPENSATION_MAX_ATTEMPTS; attempt += 1) {
      delays.push(Date.parse(item.nextRetryAt!) - h.clock.now().getTime());
      expect(h.compensations.claim(item.id, item.nextRetryAt!)).toBe(true);
      const retry = h.runs.createRun({ workflowId: h.wf.id, version: 1, trigger: 'schedule' });
      h.compensations.markRetrying(item.id, retry.id);
      h.runs.finishRun(retry.id, 'failed', { error: { code: 'network', message: 'reset' } });
      h.service.onRunTerminal(h.runs.getRun(retry.id)!);
      item = h.compensations.getByRootRun(root.id)!;
    }

    expect(delays).toEqual([...FLOW_COMPENSATION_BACKOFF_MS]);
    expect(item).toMatchObject({ state: 'exhausted', attempt: 3 });
    expect(h.audit.safeAppend).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'flow_compensation_scheduled' }),
    );
    expect(h.audit.safeAppend).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'flow_compensation_exhausted' }),
    );
  });

  it('重复/错位终态回调不改状态：成功与取消各收敛一次', () => {
    const h = createHarness();
    const root = failRun(h.runs, h.wf.id);
    h.service.onRunTerminal(root);
    h.service.onRunTerminal(root);
    expect(h.compensations.countsByState()).toEqual({ pending: 1, exhausted: 0 });

    const item = h.compensations.getByRootRun(root.id)!;
    const retry = h.runs.createRun({ workflowId: h.wf.id, version: 1, trigger: 'schedule' });
    h.compensations.markRetrying(item.id, retry.id);
    h.runs.finishRun(retry.id, 'succeeded');
    h.service.onRunTerminal(h.runs.getRun(retry.id)!);
    expect(h.compensations.getByRootRun(root.id)?.state).toBe('recovered');

    // 已是终态：再次回调直接忽略
    h.service.onRunTerminal(h.runs.getRun(retry.id)!);
    expect(h.compensations.getByRootRun(root.id)?.state).toBe('recovered');

    const h2 = createHarness();
    const root2 = failRun(h2.runs, h2.wf.id);
    h2.service.onRunTerminal(root2);
    const item2 = h2.compensations.getByRootRun(root2.id)!;
    const retry2 = h2.runs.createRun({ workflowId: h2.wf.id, version: 1, trigger: 'schedule' });
    h2.compensations.markRetrying(item2.id, retry2.id);
    h2.runs.finishRun(retry2.id, 'cancelled');
    h2.service.onRunTerminal(h2.runs.getRun(retry2.id)!);
    expect(h2.compensations.getByRootRun(root2.id)?.state).toBe('cancelled');
  });

  it('sweep 边界：停用流程取消、次数超限耗尽、重放抛错耗尽', () => {
    const disabled = createHarness();
    const root = failRun(disabled.runs, disabled.wf.id);
    disabled.service.onRunTerminal(root);
    disabled.workflows.setStatus(disabled.wf.id, 'disabled');
    disabled.clock.advance(FLOW_COMPENSATION_BACKOFF_MS[0]);
    expect(disabled.service.sweep()).toMatchObject({ cancelled: 1, claimed: 0 });
    expect(disabled.compensations.getByRootRun(root.id)?.state).toBe('cancelled');

    const overflow = createHarness();
    const root2 = failRun(overflow.runs, overflow.wf.id);
    overflow.compensations.create({
      rootRunId: root2.id,
      workflowId: overflow.wf.id,
      attempt: FLOW_COMPENSATION_MAX_ATTEMPTS + 1,
      nextRetryAt: T0.toISOString(),
      lastErrorJson: '{}',
    });
    expect(overflow.service.sweep(T0)).toMatchObject({ claimed: 0 });
    expect(overflow.compensations.getByRootRun(root2.id)?.state).toBe('exhausted');

    const failing = createHarness();
    const root3 = failRun(failing.runs, failing.wf.id);
    failing.service.onRunTerminal(root3);
    failing.clock.advance(FLOW_COMPENSATION_BACKOFF_MS[0]);
    failing.replayOne.mockImplementationOnce(() => {
      throw new Error('snapshot missing');
    });
    expect(failing.service.sweep()).toMatchObject({ claimed: 1, started: 0 });
    const failed = failing.compensations.getByRootRun(root3.id)!;
    expect(failed.state).toBe('exhausted');
    expect(failed.lastError?.code).toBe('flow/compensation-replay-failed');
  });

  it('sweep：根运行缺失时重放回退 manual，不中断补偿', () => {
    let hiddenRootId: string | null = null;
    const h = createHarness({
      getRunOverride: (id, base) => (id === hiddenRootId ? null : base.getRun(id)),
    });
    const root = failRun(h.runs, h.wf.id);
    hiddenRootId = root.id;
    h.service.onRunTerminal(root);
    h.clock.advance(FLOW_COMPENSATION_BACKOFF_MS[0]);

    expect(h.service.sweep()).toMatchObject({ started: 1 });
    expect(h.replayOne).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: 'manual', mode: 'snapshot', nodeMode: 'failed_node' }),
    );
  });

  it('recover 矩阵：按 lastRun 状态收敛，未终态留待终态事件', () => {
    const cases: Array<{
      name: string;
      apply?: (h: ReturnType<typeof createHarness>, runId: string) => void;
      beforeRetrying?: (h: ReturnType<typeof createHarness>, id: string) => void;
      result: Record<string, number>;
      state: string;
      attempt?: number;
    }> = [
      { name: 'queued', result: { skipped: 1 }, state: 'retrying' },
      {
        name: 'running',
        apply: (h, id) => {
          h.runs.startRun(id);
        },
        result: { skipped: 1 },
        state: 'retrying',
      },
      {
        name: 'waiting_human',
        apply: (h, id) => {
          h.runs.markWaitingHuman(id, 'node-1');
        },
        result: { skipped: 1 },
        state: 'retrying',
      },
      {
        name: 'succeeded',
        apply: (h, id) => {
          h.runs.finishRun(id, 'succeeded');
        },
        result: { recovered: 1 },
        state: 'recovered',
      },
      {
        name: 'cancelled',
        apply: (h, id) => {
          h.runs.finishRun(id, 'cancelled');
        },
        result: { cancelled: 1 },
        state: 'cancelled',
      },
      {
        name: 'failed retryable',
        apply: (h, id) => {
          h.runs.finishRun(id, 'failed', { error: { code: 'network', message: 'reset' } });
        },
        result: { requeued: 1 },
        state: 'pending',
        attempt: 2,
      },
      {
        name: 'failed auth',
        apply: (h, id) => {
          h.runs.finishRun(id, 'failed', { error: { code: 'auth', message: '401' } });
        },
        result: { exhausted: 1 },
        state: 'exhausted',
      },
      {
        name: 'interrupted at max attempts',
        beforeRetrying: (h, id) => {
          h.compensations.markPending(id, FLOW_COMPENSATION_MAX_ATTEMPTS, T0.toISOString(), '{}');
        },
        apply: (h, id) => {
          h.runs.finishRun(id, 'interrupted');
        },
        result: { exhausted: 1 },
        state: 'exhausted',
      },
    ];

    for (const item of cases) {
      const h = createHarness();
      const root = failRun(h.runs, h.wf.id);
      h.service.onRunTerminal(root);
      const compensation = h.compensations.getByRootRun(root.id)!;
      item.beforeRetrying?.(h, compensation.id);
      const retry = h.runs.createRun({ workflowId: h.wf.id, version: 1, trigger: 'schedule' });
      h.compensations.markRetrying(compensation.id, retry.id);
      item.apply?.(h, retry.id);

      const recovered = h.service.recover();
      expect(recovered, item.name).toMatchObject(item.result);
      expect(h.compensations.getByRootRun(root.id), item.name).toMatchObject({
        state: item.state,
        ...(item.attempt ? { attempt: item.attempt } : {}),
      });
    }
  });

  it('recover：lastRun 记录缺失直接耗尽，避免永久卡在 retrying', () => {
    let hidden: string | null = null;
    const h = createHarness({
      getRunOverride: (id, base) => (id === hidden ? null : base.getRun(id)),
    });
    const root = failRun(h.runs, h.wf.id);
    h.service.onRunTerminal(root);
    const item = h.compensations.getByRootRun(root.id)!;
    const retry = h.runs.createRun({ workflowId: h.wf.id, version: 1, trigger: 'schedule' });
    h.compensations.markRetrying(item.id, retry.id);
    hidden = retry.id;

    expect(h.service.recover()).toMatchObject({ exhausted: 1 });
    const after = h.compensations.getByRootRun(root.id)!;
    expect(after.state).toBe('exhausted');
    expect(after.lastError?.code).toBe('flow/compensation-run-missing');
  });
});
