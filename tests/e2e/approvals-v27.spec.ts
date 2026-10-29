import { expect, test, type Page } from '@playwright/test';

/** 全新数据根首启必弹向导；跳过即写 hasOnboarded 标记 */
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

test.describe('v2.7 工作信号与审批中心', () => {
  test('工作信号快照 API 与审批中心空态', async ({ page }) => {
    const res = await page.request.get('/api/work-signals');
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as {
      data?: { signals?: unknown[]; approvals?: unknown[] };
    };
    // 全量套件共享数据根：前序 spec 刚完成的运行会以 idle/succeeded 进入最近信号，
    // 因此只断言「无待审批」与 signals 为数组，不再要求空数组（CI 模式跑得更快时必然非空）。
    expect(Array.isArray(body.data?.signals)).toBe(true);
    expect(body.data?.approvals).toEqual([]);

    await page.goto('/approvals');
    await skipOnboardingIfShown(page);
    await expect(page.getByTestId('approvals-page')).toBeVisible();
    await expect(page.getByText('没有待处理的审批。')).toBeVisible();
    await expect(page.getByRole('link', { name: '审批中心' })).toBeVisible();
  });

  test('设置页工作汇报面板可切换并落库', async ({ page }) => {
    await page.goto('/settings');
    await skipOnboardingIfShown(page);
    const panel = page.getByTestId('work-signal-panel');
    await panel.scrollIntoViewIfNeeded();
    await expect(panel).toBeVisible();

    const toggle = panel.getByTestId('work-signal-enabled');
    await expect(toggle).toBeChecked();
    await toggle.uncheck();
    await expect
      .poll(async () => {
        const res = await page.request.get('/api/settings');
        const body = (await res.json()) as { data?: { workSignalEnabled?: boolean } };
        return body.data?.workSignalEnabled;
      })
      .toBe(false);

    // 复位，避免影响同数据根后续 spec
    await toggle.check();
    await expect
      .poll(async () => {
        const res = await page.request.get('/api/settings');
        const body = (await res.json()) as { data?: { workSignalEnabled?: boolean } };
        return body.data?.workSignalEnabled;
      })
      .toBe(true);
  });
});
