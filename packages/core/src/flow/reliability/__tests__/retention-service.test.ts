import { describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import {
  createFlowRunCompensationRepository,
  createSettingsRepository,
  createWorkflowRepository,
  createWorkflowRunRepository,
} from '@wbfm/database';
import { createFlowRetentionService } from '../retention-service';

function setup() {
  const db = createDatabase(':memory:');
  const workflows = createWorkflowRepository(db);
  const runs = createWorkflowRunRepository(db);
  const compensations = createFlowRunCompensationRepository(db);
  const settings = createSettingsRepository(db);
  const wf = workflows.createWorkflow({ name: '清理' });
  const service = createFlowRetentionService({ runs, workflows, compensations, settings });
  return { db, workflows, runs, compensations, settings, service, wf };
}

function oldRun(
  runs: ReturnType<typeof createWorkflowRunRepository>,
  wfId: string,
  status: 'succeeded' | 'failed',
) {
  const run = runs.createRun({ workflowId: wfId, version: 1 });
  runs.finishRun(run.id, status, {
    ...(status === 'failed' ? { error: { code: 'x', message: 'x' } } : {}),
  });
  return run.id;
}

/** 同时回拨创建与完成时间，保留清理按完成时间判断 */
function setAge(db: DatabaseInstance, id: string, iso: string): void {
  db.prepare('UPDATE workflow_runs SET created_at = ?, finished_at = ? WHERE id = ?').run(
    iso,
    iso,
    id,
  );
}

describe('v5.0 运行保留清理', () => {
  it('默认策略 + 成功 30 天/失败 90 天/每流程 500', () => {
    const { service } = setup();
    expect(service.getPolicy()).toEqual({
      enabled: true,
      successDays: 30,
      failureDays: 90,
      maxPerWorkflow: 500,
    });
  });

  it('按状态分别淘汰，dry-run 不删除，实际删除写统计', () => {
    const { db, runs, service, wf } = setup();
    const oldSuccess = oldRun(runs, wf.id, 'succeeded');
    const recentFailed = oldRun(runs, wf.id, 'failed');
    const oldFailed = oldRun(runs, wf.id, 'failed');
    setAge(db, oldSuccess, '2026-01-01T00:00:00.000Z');
    setAge(db, recentFailed, '2026-10-01T00:00:00.000Z');
    setAge(db, oldFailed, '2025-01-01T00:00:00.000Z');

    const dry = service.cleanup({ dryRun: true, now: new Date('2026-11-24T00:00:00.000Z') });
    expect(dry.removed).toBe(2);
    expect(runs.getRun(oldSuccess)).not.toBeNull();

    const real = service.cleanup({ now: new Date('2026-11-24T00:00:00.000Z') });
    expect(real.removed).toBe(2);
    expect(runs.getRun(oldSuccess)).toBeNull();
    expect(runs.getRun(oldFailed)).toBeNull();
    expect(runs.getRun(recentFailed)).not.toBeNull();
  });

  it('待补偿运行不被清理', () => {
    const { db, runs, compensations, service, wf } = setup();
    const runId = oldRun(runs, wf.id, 'failed');
    setAge(db, runId, '2025-01-01T00:00:00.000Z');
    compensations.create({
      rootRunId: runId,
      workflowId: wf.id,
      attempt: 1,
      nextRetryAt: '2026-11-24T00:00:30.000Z',
      lastErrorJson: '{}',
    });
    const result = service.cleanup({ now: new Date('2026-11-24T00:00:00.000Z') });
    expect(result.removed).toBe(0);
    expect(runs.getRun(runId)).not.toBeNull();
  });

  it('每流程上限淘汰最旧终态运行', () => {
    const { db, runs, service, wf } = setup();
    service.setPolicy({ enabled: true, successDays: 365, failureDays: 365, maxPerWorkflow: 50 });
    for (let i = 0; i < 52; i += 1) {
      const id = oldRun(runs, wf.id, 'succeeded');
      const day = String((i % 28) + 1).padStart(2, '0');
      const month = String((Math.floor(i / 28) % 12) + 1).padStart(2, '0');
      setAge(db, id, `2026-${month}-${day}T00:00:00.000Z`);
    }
    const result = service.cleanup({ now: new Date('2026-11-24T00:00:00.000Z') });
    expect(result.removed).toBe(2);
  });
});
