import { expect, test, type Page } from '@playwright/test';

type Envelope<T> = { data?: T };

const FUTURE_DATE = '2099-01-01';

async function onboard(page: Page): Promise<void> {
  await page.request.put('/api/settings', { data: { hasOnboarded: true } });
}

test.describe.serial('v2.13 可治理 Agent', () => {
  test('策略保存 → 审计事件 → 哈希链校验通过', async ({ page }) => {
    await onboard(page);
    const policy = await page.request.get('/api/agent-policy');
    expect(policy.ok()).toBeTruthy();
    const before = ((await policy.json()) as Envelope<{ policy: { defaultMode: string }; hash: string }>)
      .data!;
    expect(before.policy.defaultMode).toBe('confirm_each');
    expect(before.hash).toHaveLength(64);

    const saved = await page.request.put('/api/agent-policy', {
      data: { ...(await policy.json()).data?.policy, defaultMode: 'plan_only' },
    });
    expect(saved.ok()).toBeTruthy();

    const events = await page.request.get('/api/audit/events?kind=policy_updated');
    const rows = ((await events.json()) as Envelope<{ events: Array<{ kind: string }> }>).data!
      .events;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]!.kind).toBe('policy_updated');

    const verified = await page.request.post('/api/audit/verify');
    const result = ((await verified.json()) as Envelope<{ ok: boolean }>).data!;
    expect(result.ok).toBe(true);
  });

  test('审计页展示链状态与策略更新事件', async ({ page }) => {
    await onboard(page);
    await page.goto('/audit');
    await expect(page.getByTestId('audit-page')).toBeVisible();
    await expect(page.getByTestId('audit-chain-status')).toContainText('哈希链完整');
    await expect(page.getByTestId('audit-page')).toContainText('策略更新');
  });

  test('定时 Agent：full_access 不被无人值守允许（422）', async ({ page }) => {
    await onboard(page);
    const assistants = await page.request.get('/api/assistants');
    const list = ((await assistants.json()) as Envelope<Array<{ id: string }>>).data!;
    const created = await page.request.post('/api/schedules', {
      data: {
        assistantId: list[0]!.id,
        kind: 'once',
        hour: 9,
        minute: 0,
        atDate: FUTURE_DATE,
        timezone: 'Asia/Shanghai',
        text: '完全放行任务',
        payload: {
          kind: 'agent_task',
          goal: '打开网页',
          conversationId: 'missing',
          permissionMode: 'full_access',
          notify: 'work_signal',
        },
      },
    });
    expect(created.status()).toBe(422);
    const body = (await created.json()) as { error?: { details?: { code?: string } } };
    expect(body.error?.details?.code).toBe('UNATTENDED_MODE_NOT_ALLOWED');
  });
});
