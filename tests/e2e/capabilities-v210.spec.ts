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

test.describe('v2.10 能力包', () => {
  test('示例包安装启用 → 技能出现 → 停用 → 卸载', async ({ page }) => {
    await page.request.put('/api/settings', { data: { hasOnboarded: true } });

    const sample = await page.request.get('/api/capabilities/sample');
    expect(sample.ok()).toBeTruthy();
    const bytes = Buffer.from(await sample.body());

    const installed = await page.request.post('/api/capabilities/install', {
      multipart: {
        file: { name: 'demo.zip', mimeType: 'application/zip', buffer: bytes },
      },
    });
    expect(installed.status()).toBe(201);
    const capability = ((await installed.json()) as Envelope<{
      id: string;
      status: string;
      effectRef: string;
    }>).data!;
    expect(capability.status).toBe('enabled');
    expect(capability.effectRef).toBe('capability-demo');

    const skills = ((await (
      await page.request.get('/api/skills')
    ).json()) as Envelope<Array<{ name: string }>>).data ?? [];
    expect(skills.some((item) => item.name === 'capability-demo')).toBe(true);

    await page.goto('/capabilities');
    await skipOnboardingIfShown(page);
    await expect(page.getByTestId('capabilities-page')).toBeVisible();
    await expect(page.getByRole('link', { name: '能力包' })).toBeVisible();
    await expect(page.getByTestId(`capability-${capability.id}`)).toBeVisible();
    await expect(page.getByTestId('capability-sample-link')).toBeVisible();

    await page.request.post(`/api/capabilities/${capability.id}/disable`);
    const afterDisable = ((await (
      await page.request.get('/api/skills')
    ).json()) as Envelope<Array<{ name: string }>>).data ?? [];
    expect(afterDisable.some((item) => item.name === 'capability-demo')).toBe(false);

    await page.request.delete(`/api/capabilities/${capability.id}`);
    const list = ((await (
      await page.request.get('/api/capabilities')
    ).json()) as Envelope<unknown[]>).data ?? [];
    expect(list).toEqual([]);
  });

  test('非法包返回 422', async ({ page }) => {
    const res = await page.request.post('/api/capabilities/install', {
      multipart: {
        file: { name: 'bad.zip', mimeType: 'application/zip', buffer: Buffer.from('not a zip') },
      },
    });
    expect(res.status()).toBe(422);
  });
});
