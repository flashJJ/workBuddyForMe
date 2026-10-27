import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  createAgentRunRepository,
  createDatabase,
  createTaskRunRepository,
  createWorkflowRepository,
  createWorkflowRunRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { createRunEvidenceService } from './run-evidence-service';

const DAY = '2026-10-20';
const START = `${DAY}T01:00:00.000Z`;

function stamp(seconds: number): string {
  return new Date(Date.parse(START) + seconds * 1000).toISOString();
}

describe('v2.6 M5 运行证据汇总', () => {
  let db: DatabaseInstance;

  beforeEach(() => {
    db = createDatabase(':memory:');
    // workflow_runs.workflow_id 有外键；先建一条空工作流
    createWorkflowRepository(db).createWorkflow({ id: 'wf1', name: '报告测试 Flow' });
  });
  afterEach(() => db.close());

  function seedTask(
    id: string,
    status: 'completed' | 'failed' | 'stopped',
    reason: 'completed' | 'max_steps' | 'user_stop' | 'error',
    seconds: number,
  ): void {
    const repo = createTaskRunRepository(db);
    const run = repo.createRun({
      id,
      conversationId: null,
      assistantId: 'a1',
      goal: '任务',
      maxSteps: 5,
    });
    repo.updateRunStatus(run.id, status, reason);
    db.prepare(`UPDATE task_runs SET created_at=?, finished_at=?, updated_at=? WHERE id=?`).run(
      START,
      stamp(seconds),
      stamp(seconds),
      run.id,
    );
  }

  function seedFlow(id: string, status: 'succeeded' | 'failed', seconds: number, code?: string): void {
    const repo = createWorkflowRunRepository(db);
    const run = repo.createRun({ id, workflowId: 'wf1', version: 1, input: {} });
    repo.finishRun(run.id, status, code ? { error: { code, message: '失败' } } : {});
    db.prepare(
      `UPDATE workflow_runs SET created_at=?, started_at=?, finished_at=? WHERE id=?`,
    ).run(START, START, stamp(seconds), run.id);
  }

  function seedAgent(id: string, status: 'done' | 'budget_exceeded' | 'failed', seconds: number): void {
    const repo = createAgentRunRepository(db);
    const run = repo.create({ id, assistantId: 'a1', goal: '协作' });
    repo.finalize(run.id, { status, errorCode: status === 'failed' ? 'AGENT_FAILED' : null });
    db.prepare(`UPDATE agent_runs SET created_at=?, updated_at=? WHERE id=?`).run(
      START,
      stamp(seconds),
      run.id,
    );
  }

  function seedAll(): void {
    seedTask('t1', 'completed', 'completed', 1);
    seedTask('t2', 'stopped', 'user_stop', 2);
    seedTask('t3', 'stopped', 'max_steps', 3);
    seedTask('t4', 'failed', 'error', 4);
    seedFlow('f1', 'succeeded', 5);
    seedFlow('f2', 'failed', 6, 'NODE_FAILED');
    seedAgent('g1', 'done', 7);
    seedAgent('g2', 'budget_exceeded', 8);
  }

  it('窗口汇总：成功率、失败 Top、耗时中位数与链路筛选', () => {
    seedAll();
    const service = createRunEvidenceService({ db });
    const report = service.report({ from: DAY, to: DAY, chain: 'all', format: 'json', locale: 'zh' });

    expect(report.totals).toMatchObject({
      total: 8,
      succeeded: 3,
      failed: 4,
      cancelled: 1,
      running: 0,
      successRate: 37.5,
      medianDurationMs: 4500,
    });
    expect(report.totals.failures.map((item) => item.code).sort()).toEqual([
      'NODE_FAILED',
      'budget_exceeded',
      'error',
      'max_steps',
    ]);
    expect(report.chains).toHaveLength(3);

    const task = report.chains.find((row) => row.chain === 'task')!;
    expect(task).toMatchObject({
      total: 4,
      succeeded: 1,
      failed: 2,
      cancelled: 1,
      successRate: 25,
      medianDurationMs: 2500,
    });

    const filtered = service.report({
      from: DAY,
      to: DAY,
      chain: 'flow',
      format: 'json',
      locale: 'zh',
    });
    expect(filtered.chains).toHaveLength(1);
    expect(filtered.totals).toMatchObject({ total: 2, succeeded: 1, failed: 1, successRate: 50 });
  });

  it('时间窗与日期校验：窗口外不统计，开始晚于结束报 422', () => {
    seedAll();
    const service = createRunEvidenceService({ db });
    const outside = service.report({
      from: '2026-10-21',
      to: '2026-10-21',
      chain: 'all',
      format: 'json',
      locale: 'zh',
    });
    expect(outside.totals.total).toBe(0);
    expect(() =>
      service.report({ from: '2026-10-22', to: '2026-10-21', chain: 'all', format: 'json', locale: 'zh' }),
    ).toThrow(/开始日期/);
  });

  it('导出 Markdown / CSV：含链路行与失败类别', () => {
    seedAll();
    const service = createRunEvidenceService({ db });
    const query = { from: DAY, to: DAY, chain: 'all' as const, format: 'json' as const, locale: 'zh' as const };

    const markdown = service.exportReport(query, 'markdown');
    expect(markdown.filename).toBe(`run-report-${DAY}_${DAY}.md`);
    expect(markdown.content).toContain('# 运行报告');
    expect(markdown.content).toContain('| task | 4 | 1 | 2 | 1 |');
    expect(markdown.content).toContain('NODE_FAILED');

    const csv = service.exportReport(query, 'csv');
    expect(csv.filename).toMatch(/\.csv$/);
    expect(csv.content).toContain('task');
    expect(csv.content).toContain('37.5');
  });
});
