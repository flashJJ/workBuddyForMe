import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createDatabase,
  createMessageRepository,
  createTaskRunRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '../secrets/cipher';
import type { ServiceDeps } from '../services/deps';
import { createWorkPlanService } from './work-plan-service';
import { buildPlanPromptBlock } from './plan-prompt';
import { createRunCompletionService } from './run-completion';

describe('WorkPlanService（v2.8 目标 / 计划 / 待办）', () => {
  let db: DatabaseInstance;
  let deps: ServiceDeps;
  let service: ReturnType<typeof createWorkPlanService>;
  const conversationId = 'c1';

  beforeEach(() => {
    setDataRootForTest(mkdtempSync(join(tmpdir(), 'wbfm-plan-')));
    db = createDatabase();
    const ts = '2026-10-29T00:00:00.000Z';
    db.prepare(
      `INSERT INTO assistants(id, name, created_at, updated_at) VALUES ('a1', 'A', ?, ?)`,
    ).run(ts, ts);
    db.prepare(
      `INSERT INTO conversations(id, assistant_id, title, created_at, updated_at) VALUES ('c1', 'a1', 'T', ?, ?)`,
    ).run(ts, ts);
    deps = { db, cipher: createWebCipher() };
    service = createWorkPlanService(deps);
  });

  afterEach(() => {
    db.close();
    resetDataRootForTest();
  });

  it('目标：创建 / 结案 / 列表', () => {
    const goal = service.createGoal({
      conversationId,
      title: '完成复盘',
      successCriteria: '一页结论',
    });
    expect(goal.status).toBe('active');
    expect(service.listGoals(conversationId)).toHaveLength(1);

    const closed = service.updateGoal(goal.id, { status: 'achieved' });
    expect(closed.status).toBe('achieved');
    expect(service.activeContext(conversationId).goal).toBeNull();
  });

  it('计划评审：draft → pending_review → approved / rejected', () => {
    const plan = service.createPlan({
      conversationId,
      title: '整理材料',
      origin: 'user',
      steps: [{ title: '收集数据' }, { title: '写结论' }],
    });
    expect(plan.status).toBe('draft');
    expect(plan.totalSteps).toBe(2);

    expect(service.reviewPlan(plan.id, { action: 'submit' }).status).toBe('pending_review');
    expect(service.reviewPlan(plan.id, { action: 'approve' }).status).toBe('approved');
    expect(service.reviewPlan(plan.id, { action: 'reject' }).status).toBe('rejected');
    expect(service.reviewPlan(plan.id, { action: 'submit' }).status).toBe('pending_review');
  });

  it('模型提出的计划直接进入待评审', () => {
    const plan = service.createPlan({
      conversationId,
      title: '模型计划',
      origin: 'model',
      steps: [{ title: '第一步' }],
    });
    expect(plan.status).toBe('pending_review');
  });

  it('步骤只前进；全部结束自动完成计划；回退被拒绝', () => {
    const plan = service.createPlan({
      conversationId,
      title: '执行计划',
      origin: 'user',
      steps: [{ title: 'A' }, { title: 'B' }],
    });
    service.reviewPlan(plan.id, { action: 'submit' });
    service.reviewPlan(plan.id, { action: 'approve' });
    const first = plan.steps[0]!;
    service.updateStep(plan.id, first.id, { status: 'running' });
    expect(() => service.updateStep(plan.id, first.id, { status: 'pending' })).toThrow(/只能前进/);
    service.updateStep(plan.id, first.id, { status: 'done' });
    const second = plan.steps[1]!;
    const done = service.updateStep(plan.id, second.id, { status: 'skipped' });
    expect(done.status).toBe('done');
    expect(done.completedSteps).toBe(2);
  });

  it('改写只允许草稿/待评审/已驳回；批准后拒绝改写', () => {
    const plan = service.createPlan({
      conversationId,
      title: '待改写',
      origin: 'user',
      steps: [{ title: '旧步骤' }],
    });
    const updated = service.updatePlan(plan.id, { steps: [{ title: '新步骤' }] });
    expect(updated.steps[0]!.title).toBe('新步骤');

    service.reviewPlan(plan.id, { action: 'submit' });
    service.reviewPlan(plan.id, { action: 'approve' });
    expect(() => service.updatePlan(plan.id, { title: '改标题' })).toThrow(/改写/);
  });

  it('todo_write：首次创建已批准清单，再次调用原子替换步骤', () => {
    const first = service.writeTodos(conversationId, [
      { title: '读资料' },
      { title: '写总结', status: 'done' },
    ]);
    expect(first.kind).toBe('todo');
    expect(first.status).toBe('approved');
    expect(first.completedSteps).toBe(1);
    expect(first.totalSteps).toBe(2);

    const second = service.writeTodos(conversationId, [
      { title: '读资料', status: 'done' },
      { title: '补数据' },
    ]);
    expect(second.id).toBe(first.id);
    expect(second.totalSteps).toBe(2);
    expect(second.completedSteps).toBe(1);
  });

  it('计划提示词：未批准标注待评审，审批后不再提示', () => {
    const plan = service.createPlan({
      conversationId,
      title: '待评审计划',
      origin: 'model',
      steps: [{ title: '高风险步骤' }],
    });
    const block = buildPlanPromptBlock(service.activeContext(conversationId));
    expect(block).toContain('待评审，勿执行高风险步骤');
    expect(block).toContain('高风险步骤');
    expect(plan.status).toBe('pending_review');
  });

  it('完成回投幂等：同一运行只追加一条助手消息', () => {
    const repo = createTaskRunRepository(db);
    const run = repo.createRun({
      conversationId,
      assistantId: 'a1',
      goal: '归档资料',
      maxSteps: 5,
    });
    repo.updateRunStatus(run.id, 'completed', 'completed');
    const completions = createRunCompletionService(deps);
    const final = repo.getRun(run.id)!;
    completions.completeTask(final);
    completions.completeTask(final);
    const messages = createMessageRepository(db);
    const list = messages.lastN(conversationId, 10);
    const taskMessages = list.filter((message) => message.content.includes('归档资料'));
    expect(taskMessages).toHaveLength(1);
  });

  it('定时跟进：同一预定时刻只注入一条助手消息', () => {
    const completions = createRunCompletionService(deps);
    const params = {
      scheduleId: 's1',
      occurrenceAt: '2026-10-30T01:00:00.000Z',
      conversationId,
      text: '该继续看结果啦',
    };
    completions.completeFollowUp(params);
    completions.completeFollowUp(params);
    const list = createMessageRepository(db).lastN(conversationId, 10);
    expect(list.filter((message) => message.content === params.text)).toHaveLength(1);
  });
});
