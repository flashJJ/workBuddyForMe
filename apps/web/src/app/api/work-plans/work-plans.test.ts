import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '@wbfm/core/secrets';
import { __buildContainerForTest, __setContainerForTest } from '@/lib/server/container';
import { POST as createGoal, GET as listGoals } from '../goals/route';
import { PATCH as patchGoal } from '../goals/[id]/route';
import { GET as listPlans, POST as createPlan } from './route';
import { GET as getPlan, PATCH as patchPlan } from './[id]/route';
import { POST as reviewPlan } from './[id]/review/route';
import { PATCH as patchStep } from './[id]/steps/[stepId]/route';

const jsonRequest = (body: unknown, method = 'POST') =>
  new Request('http://127.0.0.1/x', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('目标 / 计划 / 待办 API（v2.8）', () => {
  let db: DatabaseInstance;
  let conversationId: string;

  beforeEach(() => {
    setDataRootForTest(mkdtempSync(join(tmpdir(), 'wbfm-web-plans-')));
    db = createDatabase(':memory:');
    const services = __buildContainerForTest(db, createWebCipher());
    const assistantId = services.assistants.list()[0]!.id;
    conversationId = services.conversations.create(assistantId, '计划会话').id;
  });

  afterEach(() => {
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
  });

  it('目标：创建、列表、结案', async () => {
    const created = await createGoal(
      jsonRequest({ conversationId, title: '完成复盘', successCriteria: '一页结论' }),
    );
    expect(created.status).toBe(201);
    const goal = (await created.json()).data;
    expect(goal.status).toBe('active');

    const list = await listGoals(
      new Request(`http://127.0.0.1/x?conversationId=${conversationId}`),
    );
    expect((await list.json()).data).toHaveLength(1);

    const patched = await patchGoal(jsonRequest({ status: 'achieved' }, 'PATCH'), {
      params: Promise.resolve({ id: goal.id }),
    });
    expect((await patched.json()).data.status).toBe('achieved');
  });

  it('计划：创建 → 提交评审 → 批准 → 步骤推进 → 自动完成', async () => {
    const created = await createPlan(
      jsonRequest({
        conversationId,
        title: '整理材料',
        origin: 'user',
        steps: [{ title: '收集数据' }, { title: '写结论' }],
      }),
    );
    expect(created.status).toBe(201);
    const plan = (await created.json()).data;
    expect(plan.status).toBe('draft');
    expect(plan.totalSteps).toBe(2);

    const submit = await reviewPlan(jsonRequest({ action: 'submit' }), {
      params: Promise.resolve({ id: plan.id }),
    });
    expect((await submit.json()).data.status).toBe('pending_review');

    const approve = await reviewPlan(jsonRequest({ action: 'approve' }), {
      params: Promise.resolve({ id: plan.id }),
    });
    expect((await approve.json()).data.status).toBe('approved');

    const first = await patchStep(jsonRequest({ status: 'done' }, 'PATCH'), {
      params: Promise.resolve({ id: plan.id, stepId: plan.steps[0].id }),
    });
    expect((await first.json()).data.completedSteps).toBe(1);

    const second = await patchStep(jsonRequest({ status: 'skipped' }, 'PATCH'), {
      params: Promise.resolve({ id: plan.id, stepId: plan.steps[1].id }),
    });
    expect((await second.json()).data.status).toBe('done');

    const list = await listPlans(
      new Request(`http://127.0.0.1/x?conversationId=${conversationId}`),
    );
    expect((await list.json()).data[0].status).toBe('done');

    const detail = await getPlan(new Request('http://127.0.0.1/x'), {
      params: Promise.resolve({ id: plan.id }),
    });
    expect((await detail.json()).data.steps).toHaveLength(2);
  });

  it('非法状态转换：草稿直接批准 422；批准后改写 422', async () => {
    const plan = (
      await (
        await createPlan(
          jsonRequest({ conversationId, title: '草稿', steps: [{ title: 'A' }] }),
        )
      ).json()
    ).data;

    const badApprove = await reviewPlan(jsonRequest({ action: 'approve' }), {
      params: Promise.resolve({ id: plan.id }),
    });
    expect(badApprove.status).toBe(422);

    const submit = await reviewPlan(jsonRequest({ action: 'submit' }), {
      params: Promise.resolve({ id: plan.id }),
    });
    expect((await submit.json()).data.status).toBe('pending_review');
    await reviewPlan(jsonRequest({ action: 'approve' }), {
      params: Promise.resolve({ id: plan.id }),
    });

    const badPatch = await patchPlan(jsonRequest({ title: '改名' }, 'PATCH'), {
      params: Promise.resolve({ id: plan.id }),
    });
    expect(badPatch.status).toBe(422);
  });

  it('待办：POST kind=todo 直接批准，列表可见', async () => {
    const created = await createPlan(
      jsonRequest({
        conversationId,
        kind: 'todo',
        origin: 'model',
        title: '待办',
        steps: [{ title: '读资料', status: 'done' }, { title: '写总结' }],
      }),
    );
    expect(created.status).toBe(201);
    const todo = (await created.json()).data;
    expect(todo.status).toBe('approved');
    expect(todo.completedSteps).toBe(1);
  });
});
