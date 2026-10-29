import { expect, test, type Page } from '@playwright/test';

async function skipOnboardingIfShown(page: Page): Promise<void> {
  const wizard = page.getByRole('dialog', { name: '首次使用向导' });
  try {
    await wizard.waitFor({ state: 'visible', timeout: 5_000 });
  } catch {
    return;
  }
  await page.getByRole('button', { name: '跳过' }).click();
  await expect(wizard).toBeHidden();
}

type Envelope<T> = { data?: T };

test.describe('v2.8 目标 / 计划 / 待办', () => {
  test('计划评审与步骤推进 API；计划页可见目标与进度', async ({ page }) => {
    const assistantsRes = await page.request.get('/api/assistants');
    const assistants = ((await assistantsRes.json()) as Envelope<Array<{ id: string }>>).data ?? [];
    expect(assistants.length).toBeGreaterThan(0);
    const assistantId = assistants[0]!.id;

    const conversationRes = await page.request.post('/api/conversations', {
      data: { assistantId, title: 'v2.8 计划会话' },
    });
    expect(conversationRes.status()).toBe(201);
    const conversation = ((await conversationRes.json()) as Envelope<{ id: string }>).data!;

    const goalRes = await page.request.post('/api/goals', {
      data: {
        conversationId: conversation.id,
        title: '完成本周复盘',
        successCriteria: '一页结论',
      },
    });
    expect(goalRes.status()).toBe(201);

    const planRes = await page.request.post('/api/work-plans', {
      data: {
        conversationId: conversation.id,
        title: '整理复盘材料',
        origin: 'user',
        steps: [{ title: '收集数据' }, { title: '写结论' }],
      },
    });
    expect(planRes.status()).toBe(201);
    const plan = ((await planRes.json()) as Envelope<{
      id: string;
      status: string;
      steps: Array<{ id: string }>;
    }>).data!;
    expect(plan.status).toBe('draft');

    const submit = await page.request.post(`/api/work-plans/${plan.id}/review`, {
      data: { action: 'submit' },
    });
    expect(((await submit.json()) as Envelope<{ status: string }>).data?.status).toBe(
      'pending_review',
    );
    const approve = await page.request.post(`/api/work-plans/${plan.id}/review`, {
      data: { action: 'approve' },
    });
    expect(((await approve.json()) as Envelope<{ status: string }>).data?.status).toBe('approved');

    const step = await page.request.patch(
      `/api/work-plans/${plan.id}/steps/${plan.steps[0]!.id}`,
      { data: { status: 'done' } },
    );
    const stepData = ((await step.json()) as Envelope<{
      completedSteps: number;
      totalSteps: number;
    }>).data!;
    expect(stepData.completedSteps).toBe(1);
    expect(stepData.totalSteps).toBe(2);

    await page.goto(`/plans?conversation=${conversation.id}`);
    await skipOnboardingIfShown(page);
    await expect(page.getByTestId('plans-page')).toBeVisible();
    await expect(page.getByRole('link', { name: '计划' })).toBeVisible();
    await expect(page.getByText('完成本周复盘')).toBeVisible();
    await expect(page.getByText('整理复盘材料')).toBeVisible();
    await expect(page.getByTestId(`plan-${plan.id}`)).toContainText('1/2');
  });

  test('非法状态转换返回 422', async ({ page }) => {
    const assistantsRes = await page.request.get('/api/assistants');
    const assistants = ((await assistantsRes.json()) as Envelope<Array<{ id: string }>>).data ?? [];
    const conversationRes = await page.request.post('/api/conversations', {
      data: { assistantId: assistants[0]!.id, title: '非法转移' },
    });
    const conversation = ((await conversationRes.json()) as Envelope<{ id: string }>).data!;
    const planRes = await page.request.post('/api/work-plans', {
      data: { conversationId: conversation.id, title: '草稿计划', steps: [{ title: 'A' }] },
    });
    const plan = ((await planRes.json()) as Envelope<{ id: string }>).data!;

    const bad = await page.request.post(`/api/work-plans/${plan.id}/review`, {
      data: { action: 'approve' },
    });
    expect(bad.status()).toBe(422);
  });
});
